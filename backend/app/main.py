"""FastAPI application entry point."""
import traceback
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from app.config import settings
from app.database import init_db, SessionLocal
from app.api.routes import router as api_router
from app.agents.graph import resume_interrupted_workflows
from app.utils.llm import get_llm

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


# Exception handlers
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handle Pydantic validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": exc.errors() if hasattr(exc, 'errors') else str(exc)
        }
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle FastAPI request validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Request validation error",
            "errors": exc.errors()
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other unhandled exceptions."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": str(exc),
            "type": type(exc).__name__
        }
    )


@app.on_event("startup")
async def startup_event():
    """Initialize database and resume interrupted workflows on startup."""
    init_db()
    
    # Check LLM configuration
    # Note: LLM configuration is validated when get_llm() is called
    provider = settings.LLM_PROVIDER.lower()
    print(f"LLM Provider: {provider}")
    
    try:
        llm = get_llm()
        if provider == "huggingface":
            print(f"✓ LLM initialized successfully")
            print(f"  Provider: {provider}")
            print(f"  Model: {settings.HUGGINGFACE_MODEL}")
        elif provider == "mistral":
            print(f"✓ LLM initialized successfully")
            print(f"  Provider: {provider}")
            print(f"  Model: {settings.MISTRAL_MODEL}")
        else:
            print(f"✓ LLM initialized successfully")
            print(f"  Provider: {provider}")
    except Exception as e:
        print(f"✗ LLM initialization failed: {str(e)}")
        if provider == "huggingface":
            print(f"  HUGGINGFACE_API_KEY: {'SET' if settings.HUGGINGFACE_API_KEY else 'NOT SET'}")
            print(f"  HUGGINGFACE_MODEL: {settings.HUGGINGFACE_MODEL}")
        elif provider == "mistral":
            print(f"  MISTRAL_API_KEY: {'SET' if settings.MISTRAL_API_KEY else 'NOT SET'}")
            print(f"  MISTRAL_MODEL: {settings.MISTRAL_MODEL}")
    
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


@app.get("/health/llm")
async def health_llm():
    """Check if LLM is configured and can connect."""
    provider = settings.LLM_PROVIDER.lower()
    
    result = {
        "provider": provider,
        "configured": False,
        "model": settings.HUGGINGFACE_MODEL if provider == "huggingface" else settings.MISTRAL_MODEL,
        "connected": False,
        "error": None,
    }
    
    # Try to initialize LLM (get_llm() will validate configuration)
    try:
        llm = get_llm()
        result["configured"] = True
        result["connected"] = True
        
        # Try a simple test call
        try:
            test_response = llm.invoke("Say 'OK' if you can read this.")
            test_content = test_response.content if hasattr(test_response, 'content') else str(test_response)
            result["test_response"] = test_content[:100]  # First 100 chars
            result["status"] = "connected_and_working"
        except Exception as test_error:
            result["connected"] = True  # LLM initialized but test call failed
            result["error"] = f"LLM initialized but test call failed: {str(test_error)}"
            result["status"] = "initialized_but_test_failed"
            
    except Exception as e:
        result["error"] = str(e)
        result["status"] = "connection_failed"
    
    return result

