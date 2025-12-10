"""MCP (Model Context Protocol) server implementation."""
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from app.config import settings
from app.database import SessionLocal, init_db
from app.models.protocol import Protocol, User
from app.agents.graph import run_protocol_workflow
import asyncio
import json

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
                user = db.query(User).filter(User.id == user_id).first()
                if not user:
                    return [TextContent(
                        type="text",
                        text=f"Error: User {user_id} not found"
                    )]
            else:
                # Create or get a default system user for MCP
                user = db.query(User).filter(User.email == "mcp@cerina.foundry").first()
                if not user:
                    from app.models.protocol import User
                    from app.api.auth import get_password_hash
                    user = User(
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
            
            # Start workflow
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

