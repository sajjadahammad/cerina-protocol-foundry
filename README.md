# Cerina Protocol Foundry

Multi-agent system for autonomous CBT protocol design using LangGraph, FastAPI, and React.

## Quick Start

### Option 1: Using the Scripts (Recommended)

**Windows (PowerShell):**
```powershell
.\start.ps1
```

**Linux/Mac:**
```bash
./start.sh
```

**Using npm (Cross-platform):**
```bash
# First time setup
npm install
npm run setup

# Run both servers
npm run dev
```

### Option 2: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
# Activate virtual environment
# Windows: venv\Scripts\activate
# Linux/Mac: source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp env.template .env
# Edit .env and add your MISTRAL_API_KEY
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

### 3. Environment Variables

**Backend (`backend/.env`):**
```env
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///./cerina_foundry.db
MISTRAL_API_KEY=your-mistral-api-key-here
MISTRAL_MODEL=mistral-large-latest
```

**Frontend (`frontend/.env.local` - optional):**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## Features

### Multi-Agent System
- **Supervisor Agent**: Routes tasks and orchestrates workflow
- **Drafter Agent**: Creates protocol drafts using Mistral AI
- **Safety Guardian**: Checks for safety issues and medical advice
- **Clinical Critic**: Evaluates empathy, tone, and structure

### Key Capabilities
- ✅ Database-backed checkpointing (resume after crashes)
- ✅ Real-time agent thought streaming (SSE)
- ✅ Human-in-the-loop approval workflow
- ✅ Complete protocol history and versioning
- ✅ MCP server integration
- ✅ JWT authentication

## Project Structure

```
cerina-protocol-foundry/
├── backend/
│   ├── app/
│   │   ├── agents/          # LangGraph agents
│   │   ├── api/              # REST endpoints
│   │   ├── models/           # Database models
│   │   └── mcp/              # MCP server
│   ├── requirements.txt
│   └── .env                  # Backend config
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js pages
│   │   ├── components/       # React components
│   │   ├── hooks/            # React hooks
│   │   └── lib/              # API services
│   └── package.json
├── start.ps1                 # Windows startup script
├── start.sh                  # Unix startup script
└── package.json              # Root package.json
```

## API Integration

The frontend is fully integrated with the backend API:

- **Authentication**: `src/lib/auth.ts` - Login, register, logout
- **Protocols**: `src/lib/protocols.ts` - All protocol operations
- **Hooks**: `src/hooks/` - React Query hooks for API calls
- **Axios Instance**: `src/lib/axios.ts` - Centralized API client

All API calls go through the service files and use the centralized axios instance with automatic token injection.

## Development

### Backend Development
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### Frontend Development
```bash
cd frontend
npm run dev
```

### Running Tests
```bash
# Backend tests (when implemented)
cd backend
pytest

# Frontend tests (when implemented)
cd frontend
npm test
```

## Troubleshooting

### Backend won't start
- Check that `.env` file exists in `backend/` directory
- Verify `MISTRAL_API_KEY` is set in `.env`
- Ensure virtual environment is activated
- Check that port 8000 is not in use

### Frontend can't connect to backend
- Verify backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `frontend/.env.local`
- Ensure CORS is configured correctly in backend

### Database issues
- Delete `backend/cerina_foundry.db` to reset database
- Database will be recreated on next startup

## License

MIT




