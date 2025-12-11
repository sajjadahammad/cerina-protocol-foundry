"""Finalize node: saves the final approved artifact."""
from datetime import datetime, timezone, timedelta
from app.agents.state import ProtocolState
from app.agents.nodes.common import save_agent_thought
from app.models.protocol import Protocol, ProtocolVersion
from sqlalchemy.orm import Session

# IST (Indian Standard Time) is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def finalize_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Finalize node: saves the final approved artifact."""
    protocol_id = state["protocol_id"]
    
    # Update protocol in database
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if protocol:
        # Save final version
        final_version = ProtocolVersion(
            protocol_id=protocol_id,
            version=len(protocol.versions) + 1,
            content=protocol.current_draft or state.get("current_draft", ""),
            author="system",
            timestamp=datetime.now(IST),  # Use IST (Indian Standard Time)
        )
        db.add(final_version)
        
        # Mark as approved and finalize
        protocol.status = "approved"
        db.commit()
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        "Final artifact saved. Protocol approved and finalized.",
        "action"
    )
    
    state["status"] = "approved"
    state["is_approved"] = True
    state["next_agent"] = "finish"
    
    return state

