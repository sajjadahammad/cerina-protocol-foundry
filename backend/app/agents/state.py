"""LangGraph state definition for the multi-agent protocol generation system."""
from typing import TypedDict, List, Dict, Any, Annotated
from langgraph.graph.message import add_messages


class AgentNote(TypedDict):
    """A note left by an agent in the shared scratchpad."""
    agent: str  # drafter, safety_guardian, clinical_critic, supervisor
    content: str
    timestamp: str


class ProtocolState(TypedDict):
    """Shared state (blackboard) for the multi-agent system."""
    # Core protocol data
    protocol_id: str
    intent: str
    protocol_type: str
    
    # Current draft
    current_draft: str
    
    # Version history
    versions: Annotated[List[Dict[str, Any]], add_messages]
    
    # Safety metrics
    safety_score: Dict[str, Any]  # {"score": int, "flags": List[str], "notes": str}
    
    # Empathy metrics
    empathy_metrics: Dict[str, Any]  # {"score": int, "tone": str, "suggestions": List[str]}
    
    # Agent scratchpad (shared notes)
    agent_notes: Annotated[List[AgentNote], add_messages]
    
    # Iteration tracking
    iteration_count: int
    
    # Status tracking
    status: str  # drafting, reviewing, awaiting_approval, approved, rejected
    
    # Supervisor routing
    next_agent: str  # drafter, safety_guardian, clinical_critic, halt, finish
    
    # Flags for workflow control
    needs_revision: bool
    is_approved: bool
    should_halt: bool
    
    # Metadata
    last_agent: str
    revision_reasons: List[str]

