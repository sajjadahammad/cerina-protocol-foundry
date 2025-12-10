"""LangGraph workflow definition for the multi-agent protocol generation system."""
from typing import Literal
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from app.agents.state import ProtocolState
from app.agents.nodes import (
    supervisor_node,
    drafter_node,
    safety_guardian_node,
    clinical_critic_node,
    halt_node,
    save_agent_thought,
)
from app.agents.checkpointer import create_checkpointer
from sqlalchemy.orm import Session
import asyncio
from concurrent.futures import ThreadPoolExecutor


def route_next_agent(state: ProtocolState) -> Literal["drafter", "safety_guardian", "clinical_critic", "halt", "finish"]:
    """Route to the next agent based on supervisor decision."""
    return state["next_agent"]


def create_protocol_workflow(db: Session, protocol_id: str):
    """Create and configure the LangGraph workflow for a protocol."""
    # Create checkpointer
    checkpointer = create_checkpointer(db, protocol_id)
    
    # Create graph
    workflow = StateGraph(ProtocolState)
    
    # Add nodes
    workflow.add_node("supervisor", lambda state: supervisor_node(state, db))
    workflow.add_node("drafter", lambda state: drafter_node(state, db))
    workflow.add_node("safety_guardian", lambda state: safety_guardian_node(state, db))
    workflow.add_node("clinical_critic", lambda state: clinical_critic_node(state, db))
    workflow.add_node("halt", lambda state: halt_node(state, db))
    
    # Set entry point
    workflow.set_entry_point("supervisor")
    
    # Add conditional edges from supervisor
    workflow.add_conditional_edges(
        "supervisor",
        route_next_agent,
        {
            "drafter": "drafter",
            "safety_guardian": "safety_guardian",
            "clinical_critic": "clinical_critic",
            "halt": "halt",
            "finish": END,
        }
    )
    
    # All agents return to supervisor
    workflow.add_edge("drafter", "supervisor")
    workflow.add_edge("safety_guardian", "supervisor")
    workflow.add_edge("clinical_critic", "supervisor")
    workflow.add_edge("halt", END)
    
    # Compile with checkpointer
    app = workflow.compile(checkpointer=checkpointer)
    
    return app


def run_protocol_workflow(db: Session, protocol_id: str, intent: str, protocol_type: str):
    """Run the protocol generation workflow asynchronously."""
    from app.models.protocol import Protocol
    
    # Get protocol
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if not protocol:
        raise ValueError(f"Protocol {protocol_id} not found")
    
    # Create workflow and checkpointer
    app = create_protocol_workflow(db, protocol_id)
    checkpointer = create_checkpointer(db, protocol_id)
    
    # Create config for this thread
    config = {
        "configurable": {
            "thread_id": protocol.thread_id or protocol_id,
        }
    }
    
    # Check for existing checkpoint first (for crash recovery)
    existing_checkpoint = checkpointer.get(config)
    
    if existing_checkpoint and existing_checkpoint.get("checkpoint"):
        # Resume from checkpoint
        state = existing_checkpoint["checkpoint"]["channel_values"]
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            f"Resuming workflow from checkpoint. Current iteration: {state.get('iteration_count', 0)}, Status: {state.get('status', 'unknown')}",
            "action"
        )
    else:
        # Start fresh
        state: ProtocolState = {
            "protocol_id": protocol_id,
            "intent": intent,
            "protocol_type": protocol_type,
            "current_draft": "",
            "versions": [],
            "safety_score": {"score": 0, "flags": [], "notes": ""},
            "empathy_metrics": {"score": 0, "tone": "", "suggestions": []},
            "agent_notes": [],
            "iteration_count": 0,
            "status": "drafting",
            "next_agent": "supervisor",
            "needs_revision": False,
            "is_approved": False,
            "should_halt": False,
            "last_agent": "",
            "revision_reasons": [],
        }
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Starting new workflow.",
            "action"
        )
    
    # Run workflow in thread pool (since LangGraph can be blocking)
    def run_sync():
        try:
            for event in app.stream(state, config):
                # Each event is a step in the workflow
                # The checkpointer will save state automatically
                pass
        except Exception as e:
            # Update protocol status on error
            protocol.status = "rejected"
            db.commit()
            raise e
    
    # Run in background thread
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(run_sync)
    
    return future


def resume_interrupted_workflows(db: Session):
    """Resume any workflows that were interrupted (e.g., by server crash)."""
    from app.models.protocol import Protocol
    
    # Find protocols that are in progress but not completed
    interrupted_protocols = db.query(Protocol).filter(
        Protocol.status.in_(["drafting", "reviewing"])
    ).all()
    
    for protocol in interrupted_protocols:
        try:
            # Resume the workflow
            run_protocol_workflow(
                db,
                protocol.id,
                protocol.intent,
                protocol.protocol_type
            )
        except Exception as e:
            # Log error but continue with other protocols
            print(f"Failed to resume protocol {protocol.id}: {str(e)}")
            protocol.status = "rejected"
            db.commit()

