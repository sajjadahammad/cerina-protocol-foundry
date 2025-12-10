"""Vercel AI SDK compatible streaming endpoint for protocol content."""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.api.auth import get_current_user
from app.models.protocol import User, Protocol, AgentThought
import json
import asyncio
from typing import Optional

router = APIRouter()


@router.post("/protocols/{protocol_id}/chat")
async def stream_protocol_content(
    protocol_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream protocol content updates in Vercel AI SDK format."""
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
    
    async def generate_stream():
        """Generate streaming content in Vercel AI SDK format."""
        last_content_length = 0
        last_thought_id = None
        max_wait_time = 300  # 5 minutes max
        start_time = asyncio.get_event_loop().time()
        accumulated_content = ""
        
        while True:
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > max_wait_time:
                break
            
            # Get protocol updates
            db.refresh(protocol)
            current_content = protocol.current_draft or ""
            
            # Stream new content chunks as text deltas
            if len(current_content) > last_content_length:
                new_content = current_content[last_content_length:]
                accumulated_content += new_content
                # Send as text delta (type 0 in Vercel AI SDK format)
                yield f"0:{json.dumps(new_content)}\n"
                last_content_length = len(current_content)
            
            # Get new agent thoughts
            query = db.query(AgentThought).filter(
                AgentThought.protocol_id == protocol_id
            ).order_by(AgentThought.timestamp)
            
            if last_thought_id:
                query = query.filter(AgentThought.id > last_thought_id)
            
            thoughts = query.all()
            
            # Send new thoughts as data parts (type 8 in Vercel AI SDK format)
            for thought in thoughts:
                annotation = {
                    "type": "agent_thought",
                    "id": thought.id,
                    "agentRole": thought.agent_role,
                    "agentName": thought.agent_name,
                    "content": thought.content,
                    "timestamp": thought.timestamp.isoformat(),
                    "thoughtType": thought.type,
                }
                yield f"8:{json.dumps(annotation)}\n"
                
                if thought.id:
                    last_thought_id = thought.id
            
            # Check if protocol is complete - include awaiting_approval as a complete state
            if protocol.status in ["approved", "rejected", "awaiting_approval"]:
                # Send final state as data part
                final_state = {
                    "type": "final",
                    "status": protocol.status,
                    "currentDraft": protocol.current_draft,
                    "iterationCount": protocol.iteration_count,
                    "safetyScore": protocol.safety_score,
                    "empathyMetrics": protocol.empathy_metrics,
                }
                yield f"8:{json.dumps(final_state)}\n"
                break
            
            # Wait before next check - reduced for smoother streaming
            await asyncio.sleep(0.1)  # Faster updates for smoother streaming
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

