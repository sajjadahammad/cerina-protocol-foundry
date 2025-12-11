"""MCP (Model Context Protocol) server implementation."""
import os
import sys
from pathlib import Path

# Ensure we can find the .env file in the backend directory
# When run from Claude Desktop, the working directory might not be set correctly
backend_dir = Path(__file__).parent.parent.parent
env_file = backend_dir / ".env"
if env_file.exists():
    # Load .env file explicitly using python-dotenv if available
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file, override=True)
    except ImportError:
        # Fallback: manually read .env file
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

# Import settings AFTER ensuring environment variables are loaded
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from app.config import settings
from app.database import SessionLocal, init_db
from app.models.protocol import Protocol, User as UserModel, AgentThought
from app.api.auth import get_password_hash
from app.agents.graph import run_protocol_workflow
import asyncio
import json

# Verify API key is configured and reload settings if needed
# Pydantic-settings reads env vars at instantiation, so we need to check os.environ directly
hf_key_from_env = os.getenv("HUGGINGFACE_API_KEY")
if hf_key_from_env and not settings.HUGGINGFACE_API_KEY:
    # Environment variable is set but settings didn't pick it up - reload settings
    from app.config import Settings
    settings = Settings()
    sys.stderr.write("Reloaded settings to pick up environment variables\n")

# Debug output (to stderr so it doesn't break MCP JSON protocol)
if settings.LLM_PROVIDER.lower() == "huggingface":
    if settings.HUGGINGFACE_API_KEY:
        sys.stderr.write(f"✓ HUGGINGFACE_API_KEY is configured (length: {len(settings.HUGGINGFACE_API_KEY)})\n")
    else:
        sys.stderr.write("✗ WARNING: HUGGINGFACE_API_KEY not found\n")
        sys.stderr.write(f"  LLM_PROVIDER: {settings.LLM_PROVIDER}\n")
        sys.stderr.write(f"  os.getenv('HUGGINGFACE_API_KEY'): {'SET' if os.getenv('HUGGINGFACE_API_KEY') else 'NOT SET'}\n")
        # Try to set it directly from os.environ as fallback
        if os.getenv("HUGGINGFACE_API_KEY"):
            settings.HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
            sys.stderr.write("  Set HUGGINGFACE_API_KEY directly from os.environ\n")

# Initialize database
init_db()

# Create MCP server
server = Server(settings.MCP_SERVER_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available MCP tools."""
    return [
        Tool(
            name="create_cbt_protocol",
            description="Create a CBT (Cognitive Behavioral Therapy) protocol using the Cerina Protocol Foundry multi-agent system. The system will autonomously design, critique, and refine the protocol before presenting it for approval.",
            inputSchema={
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "description": "Detailed description of the protocol intent, including clinical context, patient characteristics, and specific goals."
                    },
                    "protocol_type": {
                        "type": "string",
                        "enum": [
                            "exposure_hierarchy",
                            "thought_record",
                            "behavioral_activation",
                            "safety_planning",
                            "sleep_hygiene",
                            "custom"
                        ],
                        "description": "Type of CBT protocol to create."
                    },
                    "user_id": {
                        "type": "string",
                        "description": "Optional user ID. If not provided, a default system user will be used."
                    }
                },
                "required": ["intent", "protocol_type"]
            }
        ),
        Tool(
            name="get_protocol_status",
            description="Get the current status and details of a protocol by its ID. Returns status, current draft, iteration count, safety scores, empathy metrics, and other relevant information.",
            inputSchema={
                "type": "object",
                "properties": {
                    "protocol_id": {
                        "type": "string",
                        "description": "The protocol ID to check status for."
                    }
                },
                "required": ["protocol_id"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    if name == "create_cbt_protocol":
        intent = arguments.get("intent")
        protocol_type = arguments.get("protocol_type")
        user_id = arguments.get("user_id")
        
        if not intent or not protocol_type:
            return [TextContent(
                type="text",
                text="Error: intent and protocol_type are required"
            )]
        
        # Get or create a system user for MCP requests
        db = SessionLocal()
        try:
            if user_id:
                user = db.query(UserModel).filter(UserModel.id == user_id).first()
                if not user:
                    return [TextContent(
                        type="text",
                        text=f"Error: User {user_id} not found"
                    )]
            else:
                # Create or get a default system user for MCP
                user = db.query(UserModel).filter(UserModel.email == "mcp@cerina.foundry").first()
                if not user:
                    user = UserModel(
                        name="MCP System User",
                        email="mcp@cerina.foundry",
                        hashed_password=get_password_hash("system")
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)
            
            # Create protocol
            protocol = Protocol(
                user_id=user.id,
                title=f"{protocol_type.replace('_', ' ').title()} Protocol",
                intent=intent,
                protocol_type=protocol_type,
                current_draft="",
                status="drafting",
                iteration_count=0,
                safety_score={"score": 0, "flags": [], "notes": ""},
                empathy_metrics={"score": 0, "tone": "", "suggestions": []},
            )
            db.add(protocol)
            db.commit()
            db.refresh(protocol)
            
            # Start workflow (all print statements in workflow now use stderr to avoid breaking MCP JSON protocol)
            run_protocol_workflow(db, protocol.id, intent, protocol_type)
            
            return [TextContent(
                type="text",
                text=json.dumps({
                    "protocol_id": protocol.id,
                    "status": "started",
                    "message": f"Protocol generation started. The multi-agent system is now creating and refining your {protocol_type} protocol. Use the protocol_id to check status.",
                    "protocol_type": protocol_type,
                    "intent": intent
                }, indent=2)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=f"Error creating protocol: {str(e)}"
            )]
        finally:
            db.close()
    elif name == "get_protocol_status":
        protocol_id = arguments.get("protocol_id")
        
        if not protocol_id:
            return [TextContent(
                type="text",
                text="Error: protocol_id is required"
            )]
        
        db = SessionLocal()
        try:
            protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
            
            if not protocol:
                return [TextContent(
                    type="text",
                    text=json.dumps({
                        "error": f"Protocol {protocol_id} not found"
                    }, indent=2)
                )]
            
            # Get recent agent thoughts (last 10)
            recent_thoughts = (
                db.query(AgentThought)
                .filter(AgentThought.protocol_id == protocol_id)
                .order_by(AgentThought.timestamp.desc())
                .limit(10)
                .all()
            )
            
            # Format response
            response = {
                "protocol_id": protocol.id,
                "title": protocol.title,
                "status": protocol.status,
                "protocol_type": protocol.protocol_type,
                "intent": protocol.intent,
                "iteration_count": protocol.iteration_count,
                "current_draft_preview": protocol.current_draft[:500] + "..." if len(protocol.current_draft) > 500 else protocol.current_draft,
                "current_draft_length": len(protocol.current_draft),
                "safety_score": protocol.safety_score or {"score": 0, "flags": [], "notes": ""},
                "empathy_metrics": protocol.empathy_metrics or {"score": 0, "tone": "", "suggestions": []},
                "created_at": protocol.created_at.isoformat() if protocol.created_at else None,
                "updated_at": protocol.updated_at.isoformat() if protocol.updated_at else None,
                "recent_thoughts": [
                    {
                        "agent_role": thought.agent_role,
                        "agent_name": thought.agent_name,
                        "content": thought.content,
                        "type": thought.type,
                        "timestamp": thought.timestamp.isoformat() if thought.timestamp else None
                    }
                    for thought in recent_thoughts
                ]
            }
            
            # Add status-specific information
            if protocol.status == "awaiting_approval":
                response["message"] = "Protocol is ready for review and approval. The multi-agent system has completed its work."
            elif protocol.status == "approved":
                response["message"] = "Protocol has been approved and finalized."
            elif protocol.status == "rejected":
                response["message"] = "Protocol was rejected."
            elif protocol.status in ["drafting", "reviewing"]:
                response["message"] = f"Protocol is currently being processed by the multi-agent system (status: {protocol.status})."
            
            return [TextContent(
                type="text",
                text=json.dumps(response, indent=2)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": f"Error getting protocol status: {str(e)}"
                }, indent=2)
            )]
        finally:
            db.close()
    else:
        return [TextContent(
            type="text",
            text=f"Unknown tool: {name}"
        )]


async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())

