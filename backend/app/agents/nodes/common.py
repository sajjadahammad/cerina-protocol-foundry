"""Common utilities for agent nodes."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.protocol import AgentThought


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
        timestamp=datetime.now(timezone.utc),  # Explicitly set current UTC time
    )
    db.add(thought)
    db.commit()

