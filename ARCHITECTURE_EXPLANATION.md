# Cerina Protocol Foundry - Complete Architecture Explanation

## Overview

Cerina Protocol Foundry is a multi-agent system that autonomously generates Cognitive Behavioral Therapy (CBT) protocols using LangGraph, FastAPI, and React. The system uses a **Supervisor-Worker** architecture where specialized AI agents collaborate to create, review, and refine clinical protocols.

---

## System Architecture

### High-Level Flow

```
User Request → FastAPI Backend → LangGraph Workflow → Multi-Agent System → Database → SSE Stream → React Frontend
```

---

## Backend Architecture

### 1. Entry Point (`backend/app/main.py`)

**Purpose**: FastAPI application initialization and configuration

**Key Components**:
- **FastAPI App**: Main application instance with CORS middleware
- **Exception Handlers**: Global error handling for validation and general exceptions
- **Startup Event**: 
  - Initializes database tables
  - Checks LLM configuration (Hugging Face or Mistral)
  - Resumes interrupted workflows from previous server crashes
- **Health Endpoints**: `/health` and `/health/llm` for monitoring

**Flow**:
1. App starts → CORS middleware configured
2. API routes included (`/api/v1` prefix)
3. Database initialized on startup
4. Interrupted workflows automatically resumed

---

### 2. Configuration (`backend/app/config.py`)

**Purpose**: Centralized settings management using Pydantic

**Settings**:
- **API**: Secret key, token expiration, API prefix
- **Database**: SQLite URL (configurable)
- **LLM Provider**: Switches between Hugging Face (Qwen 2.5 Pro) and Mistral
- **CORS**: Allowed origins for frontend
- **MCP Server**: Configuration for Model Context Protocol integration

**Key Feature**: Environment variable loading with `.env` file support

---

### 3. Database Layer (`backend/app/database.py`)

**Purpose**: SQLAlchemy ORM setup and session management

**Components**:
- **Engine**: SQLite database connection
- **SessionLocal**: Factory for database sessions
- **Base**: Declarative base for models
- **get_db()**: Dependency injection for FastAPI routes
- **init_db()**: Creates all tables on startup

**Session Management**: Each request gets a new session, automatically closed after use

---

### 4. Database Models (`backend/app/models/protocol.py`)

**Purpose**: SQLAlchemy ORM models representing database tables

#### **User Model**
- Stores authentication information
- Fields: `id`, `name`, `email`, `hashed_password`, `created_at`, `updated_at`
- Relationship: One-to-many with `Protocol`

#### **Protocol Model**
- Main protocol record
- Fields:
  - Core: `id`, `user_id`, `title`, `intent`, `protocol_type`, `current_draft`
  - Status: `status` (drafting/reviewing/awaiting_approval/approved/rejected)
  - Metrics: `safety_score` (JSON), `empathy_metrics` (JSON)
  - Workflow: `thread_id` (LangGraph checkpoint), `iteration_count`
  - Approval: `approved_at`, `approved_by`, `rejected_reason`
- Relationships: `versions`, `agent_thoughts`

#### **ProtocolVersion Model**
- Version history of protocol drafts
- Fields: `id`, `protocol_id`, `version`, `content`, `author`, `timestamp`
- Tracks every draft iteration with author attribution

#### **AgentThought Model**
- Real-time agent thoughts for SSE streaming
- Fields: `id`, `protocol_id`, `agent_role`, `agent_name`, `content`, `type`, `timestamp`
- Types: `thought`, `action`, `feedback`, `revision`

---

### 5. API Schemas (`backend/app/models/state.py`)

**Purpose**: Pydantic models for request/response validation

**Schemas**:
- **Authentication**: `LoginRequest`, `RegisterRequest`, `AuthResponse`, `UserResponse`
- **Protocols**: `CreateProtocolRequest`, `ProtocolResponse`, `ApproveProtocolRequest`, `RejectProtocolRequest`
- **Nested**: `SafetyScoreSchema`, `EmpathyMetricsSchema`, `AgentThoughtSchema`, `ProtocolVersionSchema`

**Validation**: Automatic request validation and response serialization

---

### 6. Authentication (`backend/app/api/auth.py`)

**Purpose**: JWT-based authentication utilities

**Functions**:
- **get_password_hash()**: Bcrypt password hashing
- **verify_password()**: Password verification
- **authenticate_user()**: Validates credentials
- **create_access_token()**: Generates JWT tokens
- **get_current_user()**: FastAPI dependency for protected routes

**Security**: JWT tokens with 7-day expiration, HS256 algorithm

---

### 7. API Routes (`backend/app/api/routes.py`)

**Purpose**: REST API endpoints for frontend

#### **Authentication Routes**:
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login (returns JWT)
- `POST /api/v1/auth/logout` - Logout (client-side token removal)
- `GET /api/v1/auth/me` - Get current user info

#### **Protocol Routes**:
- `GET /api/v1/protocols` - List all user's protocols
- `GET /api/v1/protocols/{id}` - Get single protocol
- `POST /api/v1/protocols` - Create protocol (starts workflow)
- `POST /api/v1/protocols/{id}/approve` - Approve and finalize
- `POST /api/v1/protocols/{id}/reject` - Reject protocol
- `POST /api/v1/protocols/{id}/halt` - Manually halt workflow
- `POST /api/v1/protocols/{id}/resume` - Resume halted workflow

**Key Flow - Protocol Creation**:
1. User creates protocol → Database record created
2. Workflow started in background thread
3. Protocol returned immediately (status: "drafting")
4. Agents work asynchronously, updating database

---

### 8. SSE Streaming (`backend/app/api/websocket.py`)

**Purpose**: Real-time agent thought streaming via Server-Sent Events

**Endpoint**: `GET /api/v1/protocols/{protocol_id}/stream?token=JWT`

**How It Works**:
1. Client connects with JWT token (query param, not header - EventSource limitation)
2. Server polls database every 0.5 seconds for new `AgentThought` records
3. New thoughts sent as SSE events
4. Protocol updates (draft, status, metrics) also streamed
5. Stream closes when status reaches terminal state (approved/rejected/awaiting_approval)

**Event Format**:
```json
{
  "id": "thought-id",
  "agentRole": "drafter",
  "agentName": "Drafter",
  "content": "Starting draft creation...",
  "timestamp": "2024-01-01T00:00:00",
  "type": "thought"
}
```

**Protocol Update Format**:
```json
{
  "type": "protocol_update",
  "currentDraft": "...",
  "status": "reviewing",
  "iterationCount": 2,
  "safetyScore": {...},
  "empathyMetrics": {...}
}
```

---

### 9. LangGraph State (`backend/app/agents/state.py`)

**Purpose**: TypedDict definition for shared agent state (blackboard pattern)

**ProtocolState Fields**:
- **Core Data**: `protocol_id`, `intent`, `protocol_type`, `current_draft`
- **Version History**: `versions` (annotated list for LangGraph)
- **Metrics**: `safety_score`, `empathy_metrics` (both dicts)
- **Agent Communication**: `agent_notes` (shared scratchpad)
- **Workflow Control**: `status`, `next_agent`, `needs_revision`, `is_approved`, `should_halt`
- **Tracking**: `iteration_count`, `last_agent`, `revision_reasons`

**State Management**: 
- State passed between agents via LangGraph
- Also persisted to database in each node
- Database is source of truth for recovery

---

### 10. Agent Nodes (`backend/app/agents/nodes.py`)

**Purpose**: Individual agent implementations

#### **LLM Configuration**:
- **get_llm()**: Unified LLM getter, switches based on `LLM_PROVIDER`
- **get_huggingface_llm()**: Qwen 2.5 Pro via Hugging Face API
- Supports both old (`langchain-community`) and new (`langchain-huggingface`) APIs

#### **Supervisor Node** (`supervisor_node`):
**Role**: Orchestrates workflow, routes to appropriate agents

**Routing Logic**:
1. Check halt condition → finish if `awaiting_approval`
2. No draft → route to `drafter`
3. Needs revision → route to `drafter` with revision reasons
4. First iteration → route to `safety_guardian`
5. Safety passed (≥80) → route to `clinical_critic`
6. Both scores good (safety≥80, empathy≥70) → finish for approval
7. Scores too low → route to `drafter` for revision
8. Max iterations (5) → finish for approval

**State Sync**: Always syncs from database before routing to ensure latest metrics

#### **Drafter Node** (`drafter_node`):
**Role**: Creates and revises protocol drafts

**Process**:
1. Builds prompt with intent, type, current draft (if revision)
2. Includes safety/empathy feedback if available
3. Calls LLM (Qwen 2.5 Pro) to generate draft
4. Updates `current_draft` in state and database
5. Creates `ProtocolVersion` record
6. Increments `iteration_count`
7. Handles errors gracefully (API failures, parsing errors)

**Error Handling**: 
- API errors (503) → retry up to 2 times, then halt
- Other errors → mark for revision

#### **Safety Guardian Node** (`safety_guardian_node`):
**Role**: Reviews protocol for safety issues

**Process**:
1. Builds safety review prompt
2. Calls LLM to analyze draft
3. Parses JSON response: `{score, flags, notes}`
4. Updates `safety_score` in state and database
5. Flags: self-harm risks, medical advice, inappropriate content

**Scoring**: 0-100 (100 = completely safe)

#### **Clinical Critic Node** (`clinical_critic_node`):
**Role**: Evaluates empathy, tone, and clinical structure

**Process**:
1. Builds empathy/tone review prompt
2. Calls LLM to analyze draft
3. Parses JSON response: `{score, tone, suggestions}`
4. Updates `empathy_metrics` in state and database
5. Provides suggestions for improvement

**Scoring**: 0-100 (100 = highly empathetic)

#### **Halt Node** (`halt_node`):
**Role**: Pauses workflow for human approval

**Process**:
1. Sets status to `awaiting_approval`
2. Saves halt thought
3. Workflow stops, waiting for human action

#### **Finalize Node** (`finalize_node`):
**Role**: Completes approved protocol

**Process**:
1. Sets status to `approved`
2. Saves finalization thought
3. Workflow ends

#### **Helper Functions**:
- **save_agent_thought()**: Persists agent thoughts to database for SSE streaming

---

### 11. LangGraph Workflow (`backend/app/agents/graph.py`)

**Purpose**: Defines the multi-agent workflow graph

#### **Graph Structure**:
```
supervisor (entry)
  ↓ (conditional routing)
  ├─→ drafter → supervisor
  ├─→ safety_guardian → supervisor
  ├─→ clinical_critic → supervisor
  ├─→ halt → END
  ├─→ finalize → END
  └─→ finish → END
```

#### **create_protocol_workflow()**:
- Creates LangGraph `StateGraph` with `ProtocolState`
- Adds all agent nodes
- Sets supervisor as entry point
- Configures conditional edges from supervisor
- All agents return to supervisor (except halt/finalize)
- Compiles with checkpointer for state persistence

#### **run_protocol_workflow()**:
**Purpose**: Executes workflow asynchronously in background thread

**Process**:
1. Creates new database session for thread
2. Loads current state from database
3. Creates workflow instance with checkpointer
4. Streams workflow execution
5. Updates protocol status periodically
6. Stops on terminal states or max iterations (200)
7. Handles errors gracefully, marks protocol as rejected on failure

**Thread Safety**: Each workflow runs in separate thread with own DB session

#### **resume_interrupted_workflows()**:
**Purpose**: Resumes workflows interrupted by server crash

**Process**:
1. Finds protocols with status `drafting` or `reviewing`
2. Restarts workflow for each
3. Handles errors per-protocol (doesn't stop others)

---

### 12. Checkpointer (`backend/app/agents/checkpointer.py`)

**Purpose**: LangGraph state persistence

**Implementation**: 
- Uses `MemorySaver` for LangGraph compatibility
- Actual persistence handled in agent nodes (direct DB updates)
- Checkpointer used for workflow resumption within same session

**Note**: Database is primary persistence mechanism, checkpointer is secondary

---

## Frontend Architecture

### 1. API Client (`frontend/src/lib/axios.ts`)

**Purpose**: Centralized HTTP client with authentication

**Features**:
- Base URL configuration (`NEXT_PUBLIC_API_URL`)
- Request interceptor: Adds JWT token from `localStorage` to headers
- Response interceptor: Handles 401 errors, redirects to login
- Timeout: 30 seconds

**Usage**: All API calls use this instance

---

### 2. API Services (`frontend/src/lib/protocols.ts`)

**Purpose**: Type-safe API service functions

**Functions**:
- `list()`: Get all protocols
- `get(id)`: Get single protocol
- `create(request)`: Create protocol
- `approve(request)`: Approve protocol
- `reject(id, reason)`: Reject protocol
- `halt(id)`: Halt workflow
- `resume(id)`: Resume workflow
- `streamUrl(id, token)`: Generate SSE stream URL

**Types**: Full TypeScript interfaces for all data structures

---

### 3. React Query Hooks (`frontend/src/hooks/use-protocols.ts`)

**Purpose**: React Query hooks for data fetching and mutations

**Hooks**:
- **useProtocols()**: List all protocols (query)
- **useProtocol(id)**: Get single protocol (query)
- **useCreateProtocol()**: Create protocol (mutation)
- **useApproveProtocol()**: Approve protocol (mutation)
- **useRejectProtocol()**: Reject protocol (mutation)
- **useHaltProtocol()**: Halt workflow (mutation)
- **useProtocolStream(id)**: SSE stream connection (custom hook)

**Features**:
- Automatic caching and invalidation
- Optimistic updates
- Error handling
- Loading states

#### **useProtocolStream()**:
**Purpose**: Manages SSE connection for real-time updates

**Process**:
1. Creates `EventSource` connection
2. Listens for `message` events
3. Parses JSON data
4. Updates React Query cache and Zustand store
5. Handles `protocol_update` events (updates draft, status, metrics)
6. Handles `agent_thought` events (adds to streaming thoughts)
7. Closes on `complete` event or error

**State Management**: Updates both React Query cache and Zustand store

---

### 4. Zustand Store (`frontend/stores/protocol-store.ts`)

**Purpose**: Client-side state management for protocol UI

**State**:
- `activeProtocol`: Currently viewed protocol
- `streamingThoughts`: Real-time agent thoughts from SSE
- `isStreaming`: Connection status
- `editedContent`: User-edited draft content

**Actions**:
- `setActiveProtocol()`: Sets active protocol, syncs editedContent
- `addStreamingThought()`: Adds thought (prevents duplicates)
- `clearStreamingThoughts()`: Clears thought list
- `setStreaming()`: Updates connection status
- `setEditedContent()`: Updates edited content
- `updateProtocolStatus()`: Updates protocol status

**Usage**: Used by protocol editor and agent thoughts panel

---

### 5. Protocol Editor (`frontend/src/components/protocol-editor.tsx`)

**Purpose**: Main UI for viewing/editing protocols

**Features**:
- **Header**: Title, status badge, metrics (safety, empathy, iterations)
- **View Modes**: Preview (markdown) and Edit (textarea)
- **Content Display**: Shows `editedContent` or `currentDraft`
- **Status Indicators**: Visual feedback for different states
- **Auto-sync**: Syncs `editedContent` with `currentDraft` on protocol change

**States Handled**:
- `drafting`/`reviewing`: Shows "Generating..." indicator
- `awaiting_approval`: Ready for user approval
- `approved`: Finalized
- `rejected`: Failed

---

### 6. Agent Thoughts Panel (`frontend/src/components/agent-thoughts-panel.tsx`)

**Purpose**: Displays real-time agent thoughts

**Features**:
- Lists all `streamingThoughts` from Zustand store
- Color-coded by agent role
- Timestamp display
- Auto-scroll to latest thought
- Animation for new thoughts

---

### 7. Protocol Actions (`frontend/src/components/protocol-actions.tsx`)

**Purpose**: Action buttons for protocol management

**Actions**:
- **Approve**: Sends edited content, finalizes protocol
- **Reject**: Rejects with reason
- **Halt**: Manually stops workflow
- **Resume**: Resumes halted workflow

**State-Dependent**: Buttons shown based on protocol status

---

## Complete Workflow Example

### User Creates Protocol

1. **Frontend**: User fills form, clicks "Create"
2. **API Call**: `POST /api/v1/protocols` with `{intent, type}`
3. **Backend**: 
   - Creates `Protocol` record (status: "drafting")
   - Starts `run_protocol_workflow()` in background thread
   - Returns protocol immediately
4. **Frontend**: Redirects to protocol page, starts SSE stream
5. **Workflow Begins**:
   - **Supervisor**: Routes to `drafter` (no draft exists)
   - **Drafter**: Calls LLM, creates draft, saves to DB
   - **Supervisor**: Routes to `safety_guardian` (draft exists)
   - **Safety Guardian**: Reviews draft, scores safety, saves to DB
   - **Supervisor**: Routes to `clinical_critic` (safety ≥80)
   - **Clinical Critic**: Reviews draft, scores empathy, saves to DB
   - **Supervisor**: Checks scores
     - If both good (safety≥80, empathy≥70) → routes to `finish`
     - If scores low → routes to `drafter` for revision
   - **Halt**: Sets status to `awaiting_approval`, workflow stops
6. **SSE Stream**: 
   - Sends agent thoughts in real-time
   - Sends protocol updates (draft, metrics)
   - Frontend updates UI automatically
7. **User Reviews**: 
   - Views draft in editor
   - Can edit content
   - Sees real-time agent thoughts
8. **User Approves**:
   - Clicks "Approve"
   - `POST /api/v1/protocols/{id}/approve` with edited content
   - Backend resumes workflow → `finalize_node`
   - Status set to `approved`
   - Protocol complete

---

## Key Design Patterns

### 1. **Blackboard Pattern**
- Shared `ProtocolState` between agents
- Agents read/write to shared state
- Supervisor coordinates access

### 2. **Supervisor-Worker**
- Supervisor routes tasks
- Workers (Drafter, Safety Guardian, Clinical Critic) perform specialized tasks
- All return to supervisor for coordination

### 3. **Human-in-the-Loop**
- Workflow halts before finalization
- Human reviews and approves
- Can edit content before approval

### 4. **Database as Source of Truth**
- All state persisted to database
- Agents sync from DB before processing
- Enables crash recovery

### 5. **Event-Driven Updates**
- SSE streams real-time updates
- Frontend reacts to events
- No polling needed

### 6. **Error Resilience**
- Workflows resume after crashes
- API errors handled gracefully
- Max iteration limits prevent infinite loops

---

## Data Flow

### Protocol Creation Flow
```
User → Frontend → API Route → Database (create) → Background Thread → LangGraph → Agents → Database (update) → SSE → Frontend (update)
```

### Real-Time Updates Flow
```
Agent Node → Database (save thought) → SSE Poll → Frontend (EventSource) → Zustand Store → React Component (re-render)
```

### Approval Flow
```
User (approve) → API Route → Database (update) → Resume Workflow → Finalize Node → Database (approved) → SSE (complete) → Frontend (update)
```

---

## Security

1. **Authentication**: JWT tokens, 7-day expiration
2. **Authorization**: User can only access own protocols
3. **Password Hashing**: Bcrypt
4. **CORS**: Configured for specific origins
5. **Input Validation**: Pydantic schemas

---

## Performance Optimizations

1. **Background Processing**: Workflows run in threads, don't block API
2. **SSE Polling**: 0.5s interval (balance between responsiveness and load)
3. **Database Indexing**: Email, protocol_id indexed
4. **React Query Caching**: Reduces API calls
5. **State Deduplication**: Prevents duplicate thoughts in UI

---

## Error Handling

1. **LLM API Errors**: Retry logic, graceful degradation
2. **Workflow Errors**: Protocol marked as rejected, error logged
3. **Database Errors**: Transactions, rollback on failure
4. **Frontend Errors**: React Query error states, user-friendly messages
5. **SSE Errors**: Auto-reconnect, timeout handling

---

## Extensibility

1. **LLM Provider Switching**: Easy to add new providers via `get_llm()`
2. **New Agents**: Add node function, register in graph
3. **New Protocol Types**: Add to frontend form, handled by drafter
4. **Custom Metrics**: Add to state, create new agent node
5. **MCP Integration**: Separate server for external tool access

---

This architecture provides a robust, scalable system for autonomous protocol generation with human oversight, real-time feedback, and crash recovery capabilities.

