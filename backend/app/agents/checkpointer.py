"""Database-backed checkpointer for LangGraph state persistence."""
from typing import Any, Optional
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy.orm import Session
from app.models.protocol import Protocol
import json
import uuid


class DatabaseCheckpointer(BaseCheckpointSaver):
    """Custom checkpointer that persists state to database."""
    
    def __init__(self, db: Session, protocol_id: str):
        """Initialize with database session and protocol ID."""
        self.db = db
        self.protocol_id = protocol_id
        self.memory_checkpointer = MemorySaver()
    
    def put(self, config: dict, checkpoint: dict, metadata: dict, new_versions: dict) -> dict:
        """Save checkpoint to database."""
        # Save to memory first (for LangGraph compatibility)
        result = self.memory_checkpointer.put(config, checkpoint, metadata, new_versions)
        
        # Also persist to database
        protocol = self.db.query(Protocol).filter(Protocol.id == self.protocol_id).first()
        if protocol:
            # Update protocol with current state
            state = checkpoint.get("channel_values", {})
            
            # Update current draft
            if "current_draft" in state:
                protocol.current_draft = state["current_draft"]
            
            # Update metrics
            if "safety_score" in state:
                protocol.safety_score = state["safety_score"]
            if "empathy_metrics" in state:
                protocol.empathy_metrics = state["empathy_metrics"]
            
            # Update iteration count
            if "iteration_count" in state:
                protocol.iteration_count = state["iteration_count"]
            
            # Update status
            if "status" in state:
                protocol.status = state["status"]
            
            # Store checkpoint data as JSON
            checkpoint_data = {
                "checkpoint": checkpoint,
                "metadata": metadata,
                "config": config,
            }
            # We'll store this in a separate field or use thread_id for LangGraph compatibility
            if not protocol.thread_id:
                protocol.thread_id = str(uuid.uuid4())
            
            self.db.commit()
        
        return result
    
    def get(self, config: dict) -> Optional[dict]:
        """Retrieve checkpoint from database."""
        # Try memory first (for active sessions)
        result = self.memory_checkpointer.get(config)
        if result:
            return result
        
        # Fallback to database (for crash recovery)
        protocol = self.db.query(Protocol).filter(Protocol.id == self.protocol_id).first()
        if protocol and protocol.thread_id:
            # Reconstruct complete checkpoint from protocol data
            # Get all versions
            versions_list = []
            for v in protocol.versions:
                versions_list.append({
                    "version": v.version,
                    "content": v.content,
                    "timestamp": v.timestamp.isoformat() if v.timestamp else "",
                    "author": v.author,
                })
            
            # Reconstruct agent notes from thoughts
            agent_notes = []
            for thought in protocol.agent_thoughts:
                agent_notes.append({
                    "agent": thought.agent_role,
                    "content": thought.content,
                    "timestamp": thought.timestamp.isoformat() if thought.timestamp else "",
                })
            
            # Determine next agent based on status and iteration
            next_agent = "supervisor"
            needs_revision = False
            revision_reasons = []
            
            if protocol.status == "awaiting_approval":
                next_agent = "halt"
            elif protocol.status == "drafting" and protocol.iteration_count == 0:
                next_agent = "drafter"
            elif protocol.status == "reviewing":
                # Check if we need revision based on scores
                safety_score = protocol.safety_score or {}
                empathy_metrics = protocol.empathy_metrics or {}
                
                if safety_score.get("score", 100) < 80:
                    next_agent = "drafter"
                    needs_revision = True
                    revision_reasons.append("Safety score below threshold")
                elif empathy_metrics.get("score", 100) < 70:
                    next_agent = "drafter"
                    needs_revision = True
                    revision_reasons.append("Empathy score below threshold")
                else:
                    next_agent = "clinical_critic"
            
            checkpoint = {
                "channel_values": {
                    "protocol_id": protocol.id,
                    "intent": protocol.intent,
                    "protocol_type": protocol.protocol_type,
                    "current_draft": protocol.current_draft or "",
                    "versions": versions_list,
                    "safety_score": protocol.safety_score or {"score": 0, "flags": [], "notes": ""},
                    "empathy_metrics": protocol.empathy_metrics or {"score": 0, "tone": "", "suggestions": []},
                    "agent_notes": agent_notes,
                    "iteration_count": protocol.iteration_count or 0,
                    "status": protocol.status,
                    "next_agent": next_agent,
                    "needs_revision": needs_revision,
                    "is_approved": protocol.status == "approved",
                    "should_halt": protocol.status == "awaiting_approval",
                    "last_agent": "",  # Could be stored separately if needed
                    "revision_reasons": revision_reasons,
                },
                "channel_versions": {},
                "versions_seen": {},
            }
            return {"config": config, "checkpoint": checkpoint}
        
        return None
    
    def list(self, config: dict, filter: dict) -> list:
        """List checkpoints."""
        return self.memory_checkpointer.list(config, filter)


def create_checkpointer(db: Session, protocol_id: str) -> DatabaseCheckpointer:
    """Create a database checkpointer for a protocol."""
    return DatabaseCheckpointer(db, protocol_id)

