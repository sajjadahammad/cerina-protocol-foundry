"""Halt node: pauses workflow for human approval."""
from app.agents.state import ProtocolState
from app.agents.nodes.common import save_agent_thought
from app.models.protocol import Protocol
from sqlalchemy.orm import Session


def halt_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Halt node: pauses workflow for human approval."""
    protocol_id = state["protocol_id"]
    
    # Update protocol in database
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if protocol:
        protocol.status = "awaiting_approval"
        # Save current draft to checkpoint
        protocol.current_draft = state.get("current_draft", "")
        db.commit()
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        "Workflow halted. Waiting for human approval.",
        "action"
    )
    
    state["status"] = "awaiting_approval"
    state["should_halt"] = True
    state["next_agent"] = "finish"
    
    return state

