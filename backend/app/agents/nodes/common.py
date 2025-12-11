"""Common utilities for agent nodes."""
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.protocol import AgentThought

# IST (Indian Standard Time) is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def save_agent_thought(
    db: Session,
    protocol_id: str,
    agent_role: str,
    agent_name: str,
    content: str,
    thought_type: str = "thought"
):
    """Save an agent thought to the database."""
    thought = AgentThought(
        protocol_id=protocol_id,
        agent_role=agent_role,
        agent_name=agent_name,
        content=content,
        type=thought_type,
        timestamp=datetime.now(IST),  # Use IST (Indian Standard Time)
    )
    db.add(thought)
    db.commit()

