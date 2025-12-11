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
    def get_agent_visit_count(db: Session, protocol_id: str, agent_role: str) -> int:
        """Get the number of times an agent has visited this protocol.
        
        Counts distinct visits by counting "thought" type entries, since each agent
        visit starts with a "thought" type entry. This is more reliable than time-based
        grouping which can miscount if LLM calls take a long time.
        
        Args:
            db: Database session
            protocol_id: Protocol ID
            agent_role: Agent role to check
            
        Returns:
            Number of distinct visits (not total thoughts)
        """
        # Count "thought" type entries - each agent visit starts with one
        visit_count = db.query(AgentThought).filter(
            AgentThought.protocol_id == protocol_id,
            AgentThought.agent_role == agent_role,
            AgentThought.type == "thought"  # Each visit starts with a "thought"
        ).count()
        
        return visit_count
    
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

