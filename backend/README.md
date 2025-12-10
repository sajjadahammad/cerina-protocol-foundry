# Cerina Protocol Foundry Backend

Multi-agent system for autonomous CBT protocol design using LangGraph, FastAPI, and Mistral AI.

## Architecture

The backend implements a **Supervisor-Worker** multi-agent architecture:

- **Supervisor Agent**: Routes tasks and orchestrates the workflow
- **Drafter Agent**: Creates and revises protocol drafts using Mistral AI
- **Safety Guardian Agent**: Checks for safety issues and inappropriate medical advice
- **Clinical Critic Agent**: Evaluates empathy, tone, and clinical structure

## Setup

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the `backend` directory:

```env
# Secret Key for JWT tokens (generate a secure random string)
SECRET_KEY=your-secret-key-change-in-production

# Database URL (SQLite for development)
DATABASE_URL=sqlite:///./cerina_foundry.db

# Mistral AI Configuration
MISTRAL_API_KEY=your-mistral-api-key-here
MISTRAL_MODEL=mistral-large-latest
```

### 3. Initialize Database

The database will be automatically initialized on first run. You can also manually initialize:

```python
from app.database import init_db
init_db()
```

### 4. Run the Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login and get access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user info

### Protocols

- `GET /api/v1/protocols` - List all protocols for current user
- `GET /api/v1/protocols/{id}` - Get a single protocol
- `POST /api/v1/protocols` - Create a new protocol (starts agent workflow)
- `POST /api/v1/protocols/{id}/approve` - Approve a protocol
- `POST /api/v1/protocols/{id}/reject` - Reject a protocol
- `POST /api/v1/protocols/{id}/halt` - Manually halt workflow
- `POST /api/v1/protocols/{id}/resume` - Resume halted workflow
- `GET /api/v1/protocols/{id}/stream` - SSE stream for real-time agent thoughts

## MCP Server

The MCP (Model Context Protocol) server exposes the protocol creation workflow as a tool for MCP clients (e.g., Claude Desktop).

### Running the MCP Server

```bash
python -m app.mcp.server
```

### MCP Tool

- **create_cbt_protocol**: Create a CBT protocol using the multi-agent system
  - Parameters:
    - `intent` (required): Detailed description of the protocol intent
    - `protocol_type` (required): Type of protocol (exposure_hierarchy, thought_record, behavioral_activation, safety_planning, sleep_hygiene, custom)
    - `user_id` (optional): User ID for the protocol

## Workflow

1. **Create Protocol**: User creates a protocol with intent and type
2. **Agent Workflow**: 
   - Supervisor routes to Drafter for initial draft
   - Safety Guardian reviews for safety issues
   - Clinical Critic evaluates empathy and structure
   - Supervisor decides if revision is needed or if ready for approval
3. **Human-in-the-Loop**: Workflow halts before finalization
4. **Approval**: Human reviews, edits if needed, and approves
5. **Completion**: Protocol is marked as approved

## State Management

The system uses a shared state (blackboard pattern) that includes:
- Current draft content
- Version history
- Safety scores and flags
- Empathy metrics
- Agent notes and thoughts
- Iteration tracking
- Status information

All state is persisted to the database via checkpoints, allowing the workflow to resume after crashes.

## Database Models

- **User**: Authentication and user information
- **Protocol**: Main protocol record with status and metrics
- **ProtocolVersion**: Version history of protocol drafts
- **AgentThought**: Real-time agent thoughts for streaming

## Development

### Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── config.py            # Configuration
│   ├── database.py          # Database setup
│   ├── models/
│   │   ├── protocol.py      # SQLAlchemy models
│   │   └── state.py          # Pydantic schemas
│   ├── agents/
│   │   ├── state.py         # LangGraph state
│   │   ├── nodes.py         # Agent node functions
│   │   ├── graph.py         # Workflow definition
│   │   └── checkpointer.py  # Database checkpointer
│   ├── api/
│   │   ├── routes.py        # REST endpoints
│   │   ├── websocket.py     # SSE streaming
│   │   └── auth.py          # Authentication utilities
│   └── mcp/
│       └── server.py        # MCP server
├── requirements.txt
└── README.md
```

## Notes

- The workflow runs asynchronously in background threads
- Agent thoughts are streamed in real-time via SSE
- All workflow steps are checkpointed for persistence
- The system automatically halts before finalization for human approval

