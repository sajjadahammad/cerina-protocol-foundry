# Quick Start Guide

## One-Command Start

### Using npm (Cross-platform)
```bash
npm run dev
```

## First Time Setup

1. **Backend Setup:**
   ```bash
   cd backend
   python -m venv venv
   # Windows: venv\Scripts\activate
   # Linux/Mac: source venv/bin/activate
   pip install -r requirements.txt
   cp env.template .env
   # Edit .env and add your MISTRAL_API_KEY
   ```

2. **Frontend Setup:**
   ```bash
   cd frontend
   npm install
   ```

3. **Or use npm setup:**
   ```bash
   npm run setup
   ```

## Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## API Integration Status

✅ **Fully Integrated**

All UI components are connected to the backend API:

- ✅ Authentication (Login/Register) → `src/lib/auth.ts`
- ✅ Protocol List → `src/hooks/use-protocols.ts`
- ✅ Protocol Creation → `src/components/create-protocol-form.tsx`
- ✅ Protocol Details → `src/app/dashboard/protocol/[id]/page.tsx`
- ✅ Real-time Streaming → `src/hooks/use-protocols.ts` (SSE)
- ✅ Protocol Actions (Approve/Reject/Halt) → `src/components/protocol-actions.tsx`
- ✅ Dashboard Stats → `src/components/stats-cards.tsx`
- ✅ Protocol History → `src/components/protocol-history-table.tsx`

All API calls use:
- Centralized axios instance (`src/lib/axios.ts`)
- Service files (`src/lib/auth.ts`, `src/lib/protocols.ts`)
- React Query hooks (`src/hooks/`)
- Automatic token injection
- Error handling and 401 redirects

## Troubleshooting

**Backend won't start:**
- Check `backend/.env` exists and has `MISTRAL_API_KEY`
- Activate virtual environment
- Check port 8000 is available

**Frontend can't connect:**
- Verify backend is running on port 8000
- Check browser console for errors
- Verify CORS settings in backend

