"""API routes for authentication and protocols."""
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.protocol import User, Protocol, ProtocolVersion, AgentThought
from app.models.state import (
    LoginRequest,
    RegisterRequest,
    AuthResponse,
    UserResponse,
    CreateProtocolRequest,
    ProtocolResponse,
    ApproveProtocolRequest,
    RejectProtocolRequest,
)
from app.api.auth import (
    get_current_user,
    get_password_hash,
    authenticate_user,
    create_access_token,
)
from app.api.websocket import router as websocket_router
from app.api.chat import router as chat_router

router = APIRouter()
router.include_router(websocket_router)
router.include_router(chat_router)


# Authentication Routes
@router.post("/auth/register", response_model=AuthResponse)
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user."""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user = User(
        name=request.name,
        email=request.email,
        hashed_password=get_password_hash(request.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Create access token
    access_token = create_access_token(data={"sub": user.id})
    
    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=access_token
    )


@router.post("/auth/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    """Login and get access token."""
    user = authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.id})
    
    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=access_token
    )


@router.post("/auth/logout")
async def logout(
    current_user: User = Depends(get_current_user)
):
    """Logout (client should discard token)."""
    return {"message": "Logged out successfully"}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    return UserResponse.model_validate(current_user)


# Protocol Routes
@router.get("/protocols", response_model=List[ProtocolResponse])
async def list_protocols(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all protocols for the current user."""
    protocols = db.query(Protocol).filter(Protocol.user_id == current_user.id).all()
    return [ProtocolResponse.from_orm(p) for p in protocols]


@router.get("/protocols/{protocol_id}", response_model=ProtocolResponse)
async def get_protocol(
    protocol_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single protocol by ID."""
    protocol = db.query(Protocol).filter(
        Protocol.id == protocol_id,
        Protocol.user_id == current_user.id
    ).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    return ProtocolResponse.from_orm(protocol)


@router.post("/protocols", response_model=ProtocolResponse)
async def create_protocol(
    request: CreateProtocolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new protocol and start agent workflow."""
    from app.agents.graph import create_protocol_workflow
    
    # Create protocol record
    now = datetime.utcnow()
    protocol = Protocol(
        user_id=current_user.id,
        title=f"{request.type.replace('_', ' ').title()} Protocol",
        intent=request.intent,
        protocol_type=request.type,
        current_draft="",
        status="drafting",
        iteration_count=0,
        safety_score={"score": 0, "flags": [], "notes": ""},
        empathy_metrics={"score": 0, "tone": "", "suggestions": []},
        updated_at=now,
    )
    db.add(protocol)
    db.commit()
    db.refresh(protocol)
    
    # Start the agent workflow asynchronously
    try:
        from app.agents.graph import run_protocol_workflow
        from app.config import settings
        
        # Check if LLM API key is configured
        if settings.LLM_PROVIDER.lower() == "huggingface":
            if not settings.HUGGINGFACE_API_KEY:
                protocol.status = "rejected"
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="HUGGINGFACE_API_KEY is not configured. Please set it in your environment variables."
                )
        # elif settings.LLM_PROVIDER.lower() == "mistral":
        #     if not settings.MISTRAL_API_KEY:
        #         protocol.status = "rejected"
        #         db.commit()
        #         raise HTTPException(
        #             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        #             detail="MISTRAL_API_KEY is not configured. Please set it in your environment variables."
        #         )
        
        # Start workflow and add error callback
        future = run_protocol_workflow(db, protocol.id, request.intent, request.type)
        
        # Add callback to handle exceptions in background thread
        def handle_workflow_error(f):
            try:
                f.result()  # This will raise any exception that occurred
            except Exception as e:
                import traceback
                error_msg = f"Workflow execution error: {str(e)}\n{traceback.format_exc()}"
                print(error_msg)
                # Update protocol status in a new session
                from app.database import SessionLocal
                error_db = SessionLocal()
                try:
                    error_protocol = error_db.query(Protocol).filter(Protocol.id == protocol.id).first()
                    if error_protocol:
                        error_protocol.status = "rejected"
                        error_db.commit()
                finally:
                    error_db.close()
        
        # Schedule error handling (non-blocking)
        import threading
        def check_future():
            import time
            time.sleep(0.1)  # Small delay to let workflow start
            if future.done():
                handle_workflow_error(future)
        
        threading.Thread(target=check_future, daemon=True).start()
        
    except Exception as e:
        # If workflow creation fails, mark protocol as failed
        protocol.status = "rejected"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start protocol generation: {str(e)}"
        )
    
    try:
        return ProtocolResponse.from_orm(protocol)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to serialize protocol response: {str(e)}"
        )


@router.post("/protocols/{protocol_id}/approve", response_model=ProtocolResponse)
async def approve_protocol(
    protocol_id: str,
    request: ApproveProtocolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve a protocol and resume workflow to finalize."""
    protocol = db.query(Protocol).filter(
        Protocol.id == protocol_id,
        Protocol.user_id == current_user.id
    ).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    if protocol.status != "awaiting_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Protocol is not awaiting approval (current status: {protocol.status})"
        )
    
    # Update draft if edited by user
    if request.editedContent:
        protocol.current_draft = request.editedContent
    
    # Set approval metadata
    protocol.approved_at = datetime.utcnow()
    protocol.approved_by = current_user.id
    
    # Resume workflow to finalize node
    from app.agents.nodes import save_agent_thought, finalize_node
    from app.agents.state import ProtocolState
    from concurrent.futures import ThreadPoolExecutor
    
    # Save approval thought
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        "Human approval received. Resuming workflow to finalize artifact.",
        "action"
    )
    
    # Reconstruct state from database (checkpoint state)
    resume_state: ProtocolState = {
        "protocol_id": protocol_id,
        "intent": protocol.intent,
        "protocol_type": protocol.protocol_type,
        "current_draft": protocol.current_draft,
        "versions": [],
        "safety_score": protocol.safety_score or {"score": 0, "flags": [], "notes": ""},
        "empathy_metrics": protocol.empathy_metrics or {"score": 0, "tone": "", "suggestions": []},
        "agent_notes": [],
        "iteration_count": protocol.iteration_count,
        "status": "awaiting_approval",
        "next_agent": "finalize",
        "needs_revision": False,
        "is_approved": True,
        "should_halt": False,
        "last_agent": "halt",
        "revision_reasons": [],
    }
    
    # Run finalize node in background
    executor = ThreadPoolExecutor(max_workers=1)
    
    def finalize_sync():
        from app.database import SessionLocal
        finalize_db = SessionLocal()
        try:
            finalize_protocol = finalize_db.query(Protocol).filter(Protocol.id == protocol_id).first()
            if finalize_protocol:
                finalize_state = resume_state.copy()
                finalize_state["current_draft"] = finalize_protocol.current_draft
                finalize_node(finalize_state, finalize_db)
        finally:
            finalize_db.close()
    
    executor.submit(finalize_sync)
    
    db.refresh(protocol)
    return ProtocolResponse.from_orm(protocol)


@router.post("/protocols/{protocol_id}/reject", response_model=ProtocolResponse)
async def reject_protocol(
    protocol_id: str,
    request: RejectProtocolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reject a protocol."""
    protocol = db.query(Protocol).filter(
        Protocol.id == protocol_id,
        Protocol.user_id == current_user.id
    ).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    protocol.status = "rejected"
    protocol.rejected_reason = request.reason
    db.commit()
    db.refresh(protocol)
    
    return ProtocolResponse.from_orm(protocol)


@router.post("/protocols/{protocol_id}/halt")
async def halt_protocol(
    protocol_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually halt a protocol workflow."""
    protocol = db.query(Protocol).filter(
        Protocol.id == protocol_id,
        Protocol.user_id == current_user.id
    ).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    # Update status to awaiting_approval
    protocol.status = "awaiting_approval"
    db.commit()
    
    return {"message": "Protocol halted successfully"}


@router.post("/protocols/{protocol_id}/resume")
async def resume_protocol(
    protocol_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Resume a halted protocol workflow."""
    protocol = db.query(Protocol).filter(
        Protocol.id == protocol_id,
        Protocol.user_id == current_user.id
    ).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    if protocol.status != "awaiting_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Protocol is not halted (current status: {protocol.status})"
        )
    
    # Resume workflow by continuing from checkpoint
    from app.agents.graph import create_protocol_workflow
    app = create_protocol_workflow(db, protocol_id)
    
    # Get current state from checkpoint
    config = {
        "configurable": {
            "thread_id": protocol.thread_id or protocol_id,
        }
    }
    
    # Update status and continue workflow
    protocol.status = "reviewing"
    db.commit()
    
    # Resume workflow in background
    from app.agents.graph import run_protocol_workflow
    run_protocol_workflow(db, protocol_id, protocol.intent, protocol.protocol_type)
    
    return {"message": "Protocol resumed successfully"}

