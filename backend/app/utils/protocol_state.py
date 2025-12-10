"""Protocol state synchronization utilities."""
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.agents.state import ProtocolState
from app.models.protocol import Protocol


def sync_state_from_db(state: ProtocolState, db: Session) -> ProtocolState:
    """Sync state from database to ensure latest metrics and draft.
    
    Args:
        state: Current protocol state
        db: Database session
        
    Returns:
        Updated state with latest database values
    """
    protocol_id = state["protocol_id"]
    db_protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    
    if db_protocol:
        state["current_draft"] = db_protocol.current_draft or state.get("current_draft", "")
        state["safety_score"] = db_protocol.safety_score or state.get("safety_score", {"score": 0, "flags": [], "notes": ""})
        state["empathy_metrics"] = db_protocol.empathy_metrics or state.get("empathy_metrics", {"score": 0, "tone": "", "suggestions": []})
        state["iteration_count"] = db_protocol.iteration_count or state.get("iteration_count", 0)
        state["status"] = db_protocol.status or state.get("status", "drafting")
        # Derive is_approved and should_halt from status
        state["is_approved"] = db_protocol.status == "approved"
        state["should_halt"] = db_protocol.status == "awaiting_approval"
    
    return state


def update_protocol_status(db: Session, protocol_id: str, new_status: str) -> None:
    """Update protocol status in database.
    
    Args:
        db: Database session
        protocol_id: Protocol ID
        new_status: New status to set
    """
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if protocol and protocol.status != new_status:
        protocol.status = new_status
        db.commit()
        print(f"Protocol {protocol_id} status updated to {new_status}")

