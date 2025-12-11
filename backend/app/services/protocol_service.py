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
        
        Counts distinct visits by grouping thoughts that occur within a short time window.
        Each agent visit typically produces multiple thoughts (thought, action, feedback),
        so we group thoughts within 2 minutes as a single visit.
        
        Args:
            db: Database session
            protocol_id: Protocol ID
            agent_role: Agent role to check
            
        Returns:
            Number of distinct visits (not total thoughts)
        """
        from sqlalchemy import func, distinct
        from datetime import timedelta
        
        # Get all thoughts for this agent
        thoughts = db.query(AgentThought).filter(
            AgentThought.protocol_id == protocol_id,
            AgentThought.agent_role == agent_role
        ).order_by(AgentThought.timestamp).all()
        
        if not thoughts:
            return 0
        
        # Group thoughts by time windows (thoughts within 2 minutes are same visit)
        visit_count = 0
        last_visit_time = None
        
        for thought in thoughts:
            if last_visit_time is None:
                # First thought = first visit
                visit_count = 1
                last_visit_time = thought.timestamp
            else:
                # If this thought is more than 2 minutes after last visit, it's a new visit
                time_diff = (thought.timestamp - last_visit_time).total_seconds()
                if time_diff > 120:  # 2 minutes = new visit
                    visit_count += 1
                    last_visit_time = thought.timestamp
                # Otherwise, same visit (don't increment)
        
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

