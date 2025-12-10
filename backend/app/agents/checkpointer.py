"""Checkpointer for LangGraph state persistence."""
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy.orm import Session


def create_checkpointer(db: Session, protocol_id: str) -> MemorySaver:
    """Create a memory checkpointer for a protocol.
    
    Note: We use MemorySaver for LangGraph compatibility. Database persistence
    is handled directly in the agent nodes when they update the protocol.
    """
    # Use a simple MemorySaver - database persistence happens in nodes
    return MemorySaver()

