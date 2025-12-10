"""Protocol business logic service."""
from sqlalchemy.orm import Session
from app.models.protocol import Protocol, AgentThought


class ProtocolService:
    """Service for protocol-related operations."""
    
    @staticmethod
    def has_agent_visited(db: Session, protocol_id: str, agent_role: str) -> bool:
        """Check if an agent has visited this protocol.
        
        Args:
            db: Database session
            protocol_id: Protocol ID
            agent_role: Agent role to check
            
        Returns:
            True if agent has visited, False otherwise
        """
        thought_count = db.query(AgentThought).filter(
            AgentThought.protocol_id == protocol_id,
            AgentThought.agent_role == agent_role
        ).count()
        return thought_count > 0
    
    @staticmethod
    def get_protocol(db: Session, protocol_id: str) -> Protocol:
        """Get protocol by ID.
        
        Args:
            db: Database session
            protocol_id: Protocol ID
            
        Returns:
            Protocol instance
            
        Raises:
            ValueError: If protocol not found
        """
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if not protocol:
            raise ValueError(f"Protocol {protocol_id} not found")
        return protocol

