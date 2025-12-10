"""SQLAlchemy database models."""
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, JSON, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


def generate_id():
    """Generate a UUID string."""
    return str(uuid.uuid4())


class User(Base):
    """User model for authentication."""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_id)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    protocols = relationship("Protocol", back_populates="user", cascade="all, delete-orphan")


class Protocol(Base):
    """Protocol model for CBT exercises."""
    __tablename__ = "protocols"
    
    id = Column(String, primary_key=True, default=generate_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    intent = Column(String, nullable=False)
    protocol_type = Column(String, nullable=False)  # exposure_hierarchy, thought_record, etc.
    current_draft = Column(Text, nullable=False, default="")
    status = Column(String, nullable=False, default="drafting")  # drafting, reviewing, awaiting_approval, approved, rejected
    iteration_count = Column(Integer, default=0)
    
    # Safety metrics (stored as JSON)
    safety_score = Column(JSON, default=lambda: {"score": 0, "flags": [], "notes": ""})
    
    # Empathy metrics (stored as JSON)
    empathy_metrics = Column(JSON, default=lambda: {"score": 0, "tone": "", "suggestions": []})
    
    # LangGraph checkpoint thread ID
    thread_id = Column(String, unique=True, nullable=True)
    
    # Approval metadata
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String, nullable=True)
    rejected_reason = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="protocols")
    versions = relationship("ProtocolVersion", back_populates="protocol", cascade="all, delete-orphan", order_by="ProtocolVersion.version")
    agent_thoughts = relationship("AgentThought", back_populates="protocol", cascade="all, delete-orphan", order_by="AgentThought.timestamp")


class ProtocolVersion(Base):
    """Version history for protocols."""
    __tablename__ = "protocol_versions"
    
    id = Column(String, primary_key=True, default=generate_id)
    protocol_id = Column(String, ForeignKey("protocols.id"), nullable=False)
    version = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    author = Column(String, nullable=False)  # drafter, safety_guardian, clinical_critic, supervisor
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    protocol = relationship("Protocol", back_populates="versions")


class AgentThought(Base):
    """Agent thoughts and actions for real-time streaming."""
    __tablename__ = "agent_thoughts"
    
    id = Column(String, primary_key=True, default=generate_id)
    protocol_id = Column(String, ForeignKey("protocols.id"), nullable=False)
    agent_role = Column(String, nullable=False)  # drafter, safety_guardian, clinical_critic, supervisor
    agent_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    type = Column(String, nullable=False)  # thought, action, feedback, revision
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    protocol = relationship("Protocol", back_populates="agent_thoughts")

