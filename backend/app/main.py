"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db, SessionLocal
from app.api.routes import router as api_router
from app.agents.graph import resume_interrupted_workflows

# Initialize FastAPI app
app = FastAPI(
    title="Cerina Protocol Foundry API",
    description="Multi-agent system for autonomous CBT protocol design",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.on_event("startup")
async def startup_event():
    """Initialize database and resume interrupted workflows on startup."""
    init_db()
    
    # Resume any workflows that were interrupted by server crash
    db = SessionLocal()
    try:
        resume_interrupted_workflows(db)
    except Exception as e:
        print(f"Error resuming workflows: {str(e)}")
    finally:
        db.close()


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Cerina Protocol Foundry API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

