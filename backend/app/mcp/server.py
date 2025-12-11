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
mistral_key_from_env = os.getenv("MISTRAL_API_KEY")
if (hf_key_from_env and not settings.HUGGINGFACE_API_KEY) or (mistral_key_from_env and not settings.MISTRAL_API_KEY):
    # Environment variable is set but settings didn't pick it up - reload settings
    from app.config import Settings
    settings = Settings()
    sys.stderr.write("Reloaded settings to pick up environment variables\n")

# Verify LLM can be initialized using the llm.py method
try:
    from app.utils.llm import get_llm
    llm = get_llm()
    provider = settings.LLM_PROVIDER.lower()
    if provider == "huggingface":
        sys.stderr.write(f"✓ LLM initialized successfully (Provider: {provider}, Model: {settings.HUGGINGFACE_MODEL})\n")
    elif provider == "mistral":
        sys.stderr.write(f"✓ LLM initialized successfully (Provider: {provider}, Model: {settings.MISTRAL_MODEL})\n")
    else:
        sys.stderr.write(f"✓ LLM initialized successfully (Provider: {provider})\n")
except Exception as e:
    provider = settings.LLM_PROVIDER.lower()
    sys.stderr.write(f"✗ WARNING: LLM initialization failed: {str(e)}\n")
    sys.stderr.write(f"  LLM_PROVIDER: {provider}\n")
    if provider == "huggingface":
        sys.stderr.write(f"  HUGGINGFACE_API_KEY: {'SET' if os.getenv('HUGGINGFACE_API_KEY') else 'NOT SET'}\n")
        sys.stderr.write(f"  HUGGINGFACE_MODEL: {settings.HUGGINGFACE_MODEL}\n")
    elif provider == "mistral":
        sys.stderr.write(f"  MISTRAL_API_KEY: {'SET' if os.getenv('MISTRAL_API_KEY') else 'NOT SET'}\n")
        sys.stderr.write(f"  MISTRAL_MODEL: {settings.MISTRAL_MODEL}\n")

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
            description="Get the current status and details of a protocol by its ID. Returns status, FULL protocol content (not preview), iteration count, safety scores, empathy metrics, and all agent thoughts.",
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
        ),
        Tool(
            name="get_protocol_content",
            description="Get the complete full protocol content by protocol ID. Returns the entire current_draft text without truncation.",
            inputSchema={
                "type": "object",
                "properties": {
                    "protocol_id": {
                        "type": "string",
                        "description": "The protocol ID to get full content for."
                    }
                },
                "required": ["protocol_id"]
            }
        ),
        Tool(
            name="get_protocol_updates",
            description="Get all new agent thoughts and protocol updates since the last check. Use this to monitor the protocol generation process in real-time. Returns new thoughts, protocol status changes, and current draft updates. Call this repeatedly with the returned last_thought_id to stream updates.",
            inputSchema={
                "type": "object",
                "properties": {
                    "protocol_id": {
                        "type": "string",
                        "description": "The protocol ID to get updates for."
                    },
                    "last_thought_id": {
                        "type": "string",
                        "description": "Optional: The ID of the last thought you received. Only thoughts after this ID will be returned. Omit to get all thoughts."
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
            
            # Get ALL agent thoughts (not just recent 10) - ordered chronologically
            all_thoughts = (
                db.query(AgentThought)
                .filter(AgentThought.protocol_id == protocol_id)
                .order_by(AgentThought.timestamp.asc())
                .all()
            )
            
            # Format response with FULL content
            response = {
                "protocol_id": protocol.id,
                "title": protocol.title,
                "status": protocol.status,
                "protocol_type": protocol.protocol_type,
                "intent": protocol.intent,
                "iteration_count": protocol.iteration_count,
                "current_draft": protocol.current_draft,  # FULL content, not preview
                "current_draft_length": len(protocol.current_draft),
                "safety_score": protocol.safety_score or {"score": 0, "flags": [], "notes": ""},
                "empathy_metrics": protocol.empathy_metrics or {"score": 0, "tone": "", "suggestions": []},
                "created_at": protocol.created_at.isoformat() if protocol.created_at else None,
                "updated_at": protocol.updated_at.isoformat() if protocol.updated_at else None,
                "all_thoughts": [  # All thoughts in chronological order
                    {
                        "id": thought.id,
                        "agent_role": thought.agent_role,
                        "agent_name": thought.agent_name,
                        "content": thought.content,
                        "type": thought.type,
                        "timestamp": thought.timestamp.isoformat() if thought.timestamp else None
                    }
                    for thought in all_thoughts
                ],
                "thought_count": len(all_thoughts)
            }
            
            # Add status-specific information
            if protocol.status == "awaiting_approval":
                response["message"] = "Protocol is ready for review and approval. The multi-agent system has completed its work."
            elif protocol.status == "approved":
                response["message"] = "Protocol has been approved and finalized."
            elif protocol.status == "rejected":
                response["message"] = "Protocol was rejected."
            elif protocol.status in ["drafting", "reviewing"]:
                response["message"] = f"Protocol is currently being processed by the multi-agent system (status: {protocol.status}). Use get_protocol_updates to monitor progress in real-time."
            
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
    elif name == "get_protocol_content":
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
            
            return [TextContent(
                type="text",
                text=json.dumps({
                    "protocol_id": protocol.id,
                    "title": protocol.title,
                    "status": protocol.status,
                    "full_content": protocol.current_draft,  # Complete protocol text
                    "content_length": len(protocol.current_draft),
                    "updated_at": protocol.updated_at.isoformat() if protocol.updated_at else None
                }, indent=2)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": f"Error getting protocol content: {str(e)}"
                }, indent=2)
            )]
        finally:
            db.close()
    elif name == "get_protocol_updates":
        protocol_id = arguments.get("protocol_id")
        last_thought_id = arguments.get("last_thought_id")
        
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
            
            # Get new thoughts since last_thought_id
            query = db.query(AgentThought).filter(
                AgentThought.protocol_id == protocol_id
            ).order_by(AgentThought.timestamp.asc())
            
            if last_thought_id:
                query = query.filter(AgentThought.id > last_thought_id)
            
            new_thoughts = query.all()
            
            # Refresh protocol to get latest state
            db.refresh(protocol)
            
            response = {
                "protocol_id": protocol.id,
                "status": protocol.status,
                "new_thoughts": [
                    {
                        "id": thought.id,
                        "agent_role": thought.agent_role,
                        "agent_name": thought.agent_name,
                        "content": thought.content,
                        "type": thought.type,
                        "timestamp": thought.timestamp.isoformat() if thought.timestamp else None
                    }
                    for thought in new_thoughts
                ],
                "new_thought_count": len(new_thoughts),
                "protocol_update": {
                    "current_draft": protocol.current_draft,
                    "current_draft_length": len(protocol.current_draft),
                    "status": protocol.status,
                    "iteration_count": protocol.iteration_count,
                    "safety_score": protocol.safety_score,
                    "empathy_metrics": protocol.empathy_metrics,
                },
                "is_complete": protocol.status in ["approved", "rejected", "awaiting_approval"],
                "last_thought_id": new_thoughts[-1].id if new_thoughts else last_thought_id
            }
            
            return [TextContent(
                type="text",
                text=json.dumps(response, indent=2)
            )]
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": f"Error getting protocol updates: {str(e)}"
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

