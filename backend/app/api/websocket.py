"""Server-Sent Events (SSE) streaming endpoint for real-time agent thoughts."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.api.auth import get_current_user
from app.models.protocol import User, Protocol, AgentThought
from jose import JWTError, jwt
from app.config import settings
import json
import asyncio
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter()


def get_user_from_token(token: Optional[str] = None, db: Session = None) -> Optional[User]:
    """Get user from token (for SSE which doesn't support headers)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id and db:
            return db.query(User).filter(User.id == user_id).first()
    except JWTError:
        return None
    return None


@router.get("/protocols/{protocol_id}/stream")
async def stream_protocol_thoughts(
    protocol_id: str,
    token: Optional[str] = Query(None, description="JWT token for authentication"),
    db: Session = Depends(get_db)
):
    """Stream agent thoughts in real-time using Server-Sent Events."""
    # Authenticate user via token (EventSource doesn't support custom headers)
    current_user = get_user_from_token(token, db)
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token"
        )
    
    # Verify protocol exists and belongs to user
    protocol = db.query(Protocol).filter(
        Protocol.id == protocol_id,
        Protocol.user_id == current_user.id
    ).first()
    
    if not protocol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protocol not found"
        )
    
    async def event_generator():
        """Generate SSE events for agent thoughts."""
        last_thought_id = None
        last_draft_length = 0  # Track last sent draft length for incremental updates
        last_status = None  # Track last status to detect changes
        last_iteration = None  # Track last iteration count
        max_wait_time = 300  # 5 minutes max
        start_time = datetime.utcnow()
        initial_sent = False  # Track if we've sent initial thoughts
        
        while True:
            # Check timeout
            if (datetime.utcnow() - start_time).seconds > max_wait_time:
                yield f"data: {json.dumps({'type': 'timeout', 'message': 'Stream timeout'})}\n\n"
                break
            
            # Expire all to ensure we see latest data from other sessions
            db.expire_all()
            
            # Get new thoughts since last check
            query = db.query(AgentThought).filter(
                AgentThought.protocol_id == protocol_id
            ).order_by(AgentThought.timestamp)
            
            if last_thought_id:
                query = query.filter(AgentThought.id > last_thought_id)
            
            thoughts = query.all()
            
            # Send new thoughts immediately
            for thought in thoughts:
                thought_data = {
                    "id": thought.id,
                    "agentRole": thought.agent_role,
                    "agentName": thought.agent_name,
                    "content": thought.content,
                    "timestamp": thought.timestamp.isoformat(),
                    "type": thought.type,
                }
                yield f"data: {json.dumps(thought_data)}\n\n"
                
                if thought.id:
                    last_thought_id = thought.id
            
            # Mark initial thoughts as sent after first batch
            if not initial_sent:
                initial_sent = True
            
            # Only send protocol updates when workflow is complete (awaiting_approval, approved, rejected)
            # This prevents streaming content during the agent thought process
            protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
            if protocol:
                current_status = protocol.status
                current_iteration = protocol.iteration_count
                
                # Initialize tracking on first connection
                if last_status is None:
                    last_status = current_status
                    last_iteration = current_iteration
                
                # Only stream protocol content when workflow is complete
                terminal_states = ["awaiting_approval", "approved", "rejected"]
                if current_status in terminal_states:
                    current_draft = protocol.current_draft or ""
                    current_length = len(current_draft)
                    
                    # Check if we need to send the final protocol content
                    if (last_status not in terminal_states or 
                        current_length != last_draft_length or 
                        current_status != last_status or 
                        current_iteration != last_iteration):
                        # Send full protocol content when workflow completes
                        protocol_update = {
                            "type": "protocol_update",
                            "currentDraft": current_draft,
                            "status": current_status,
                            "iterationCount": current_iteration,
                            "safetyScore": protocol.safety_score,
                            "empathyMetrics": protocol.empathy_metrics,
                        }
                        yield f"data: {json.dumps(protocol_update)}\n\n"
                        last_draft_length = current_length
                        last_status = current_status
                        last_iteration = current_iteration
                else:
                    # Workflow still in progress - only update status/metadata, not content
                    if current_status != last_status or current_iteration != last_iteration:
                        # Send metadata update without content
                        protocol_update = {
                            "type": "protocol_update",
                            "currentDraft": "",  # Empty during process
                            "status": current_status,
                            "iterationCount": current_iteration,
                            "safetyScore": protocol.safety_score,
                            "empathyMetrics": protocol.empathy_metrics,
                        }
                        yield f"data: {json.dumps(protocol_update)}\n\n"
                        last_status = current_status
                        last_iteration = current_iteration
                
                # Stop streaming when workflow reaches a terminal or pause state
                if protocol.status in ["approved", "rejected", "awaiting_approval"]:
                    yield f"data: {json.dumps({'type': 'complete', 'status': protocol.status})}\n\n"
                    yield f"event: complete\ndata: {json.dumps({'status': protocol.status})}\n\n"
                    break
            
            # Wait before next check (reduced to 0.05s for smoother real-time updates)
            # Note: db.expire_all() is called at the start of the loop
            await asyncio.sleep(0.05)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )

