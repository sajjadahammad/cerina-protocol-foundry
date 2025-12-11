"""LangGraph workflow definition for the multi-agent protocol generation system."""
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Literal
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from sqlalchemy.orm import Session
from app.agents.state import ProtocolState
from app.agents.nodes import (
    supervisor_node,
    drafter_node,
    safety_guardian_node,
    clinical_critic_node,
    halt_node,
    finalize_node,
    save_agent_thought,
)
from app.agents.checkpointer import create_checkpointer
from app.database import SessionLocal
from app.models.protocol import Protocol


def route_next_agent(state: ProtocolState) -> Literal["drafter", "safety_guardian", "clinical_critic", "halt", "finalize", "finish"]:
    """Route to the next agent based on supervisor decision."""
    next_agent = state.get("next_agent", "finish")
    
    # Validate that next_agent is a valid routing destination
    # If somehow "supervisor" or invalid value is set, log and route to finish
    valid_destinations = ["drafter", "safety_guardian", "clinical_critic", "halt", "finalize", "finish"]
    if next_agent not in valid_destinations:
        # Log the invalid routing attempt - this shouldn't happen if supervisor works correctly
        import sys
        sys.stderr.write(f"WARNING: Invalid next_agent value '{next_agent}' from state, defaulting to 'finish'. State keys: {list(state.keys())}\n")
        # Ensure status is set before finishing
        if "status" in state and state["status"] not in ["awaiting_approval", "approved", "rejected"]:
            state["status"] = "awaiting_approval"
        return "finish"
    
    return next_agent


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
    workflow.add_node("finalize", lambda state: finalize_node(state, db))
    
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
            "finalize": "finalize",
            "finish": END,
        }
    )
    
    # All agents return to supervisor
    workflow.add_edge("drafter", "supervisor")
    workflow.add_edge("safety_guardian", "supervisor")
    workflow.add_edge("clinical_critic", "supervisor")
    workflow.add_edge("halt", END)
    workflow.add_edge("finalize", END)
    
    # Compile with checkpointer
    app = workflow.compile(checkpointer=checkpointer)
    
    return app


def run_protocol_workflow(db: Session, protocol_id: str, intent: str, protocol_type: str):
    """Run the protocol generation workflow asynchronously."""
    # Get protocol
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if not protocol:
        raise ValueError(f"Protocol {protocol_id} not found")
    
    # Create config for this thread
    config = {
        "configurable": {
            "thread_id": protocol.thread_id or protocol_id,
        }
    }
    
    # Run workflow in thread pool (since LangGraph can be blocking)
    def run_sync():
        # Create a new database session for this thread
        thread_db = SessionLocal()
        try:
            # Get fresh protocol instance in this thread's session
            thread_protocol = thread_db.query(Protocol).filter(Protocol.id == protocol_id).first()
            if not thread_protocol:
                raise ValueError(f"Protocol {protocol_id} not found in background thread")
            
            # Create workflow (checkpointer is created inside)
            app = create_protocol_workflow(thread_db, protocol_id)
            
            # Load current state from database to sync with workflow
            # This ensures we don't lose progress and have latest metrics
            # Derive is_approved and should_halt from status field
            current_status = thread_protocol.status or "drafting"
            state: ProtocolState = {
                "protocol_id": protocol_id,
                "intent": thread_protocol.intent,
                "protocol_type": thread_protocol.protocol_type,
                "current_draft": thread_protocol.current_draft or "",
                "versions": [],
                "safety_score": thread_protocol.safety_score or {"score": 0, "flags": [], "notes": ""},
                "empathy_metrics": thread_protocol.empathy_metrics or {"score": 0, "tone": "", "suggestions": []},
                "agent_notes": [],
                "iteration_count": thread_protocol.iteration_count or 0,
                "status": current_status,
                "next_agent": "drafter",  # Start with drafter, not supervisor (supervisor is entry point)
                "needs_revision": False,
                "is_approved": current_status == "approved",
                "should_halt": current_status == "awaiting_approval",
                "last_agent": "",
                "revision_reasons": [],
            }
            save_agent_thought(
                thread_db, protocol_id, "supervisor", "Supervisor",
                "Starting new workflow.",
                "action"
            )
            
            # Save initial thought and update status BEFORE starting workflow
            # Use stderr for logging to avoid breaking MCP JSON protocol (stdout is for JSON-RPC)
            sys.stderr.write(f"Starting workflow for protocol {protocol_id}\n")
            thread_protocol.status = "reviewing"
            thread_db.commit()
            
            # Start the workflow stream with recursion limit
            sys.stderr.write(f"Beginning workflow stream for protocol {protocol_id}\n")
            event_count = 0
            # Add recursion limit to prevent infinite loops
            config_with_limit = {
                **config,
                "recursion_limit": 200,  # Increased to handle longer workflows
            }
            stream = app.stream(state, config_with_limit)
            
            # Check if stream is empty
            first_event = None
            try:
                first_event = next(stream)
                event_count += 1
                sys.stderr.write(f"Workflow event {event_count} for protocol {protocol_id}: {list(first_event.keys())}\n")
            except StopIteration:
                sys.stderr.write(f"WARNING: Workflow stream is empty for protocol {protocol_id}\n")
                raise ValueError("Workflow stream produced no events")
            
            # Process remaining events
            for event in stream:
                event_count += 1
                sys.stderr.write(f"Workflow event {event_count} for protocol {protocol_id}: {list(event.keys())}\n")
                
                # Check recursion limit early
                if event_count >= 200:
                    sys.stderr.write(f"WARNING: Approaching recursion limit for protocol {protocol_id}, forcing halt\n")
                    thread_protocol.status = "awaiting_approval"
                    thread_db.commit()
                    break
                
                # Each event is a step in the workflow
                # The checkpointer will save state automatically
                # Update protocol status periodically
                thread_db.refresh(thread_protocol)
                
                # Stop if protocol is no longer in reviewing state (halted, approved, or rejected)
                if thread_protocol.status not in ["reviewing", "drafting"]:
                    sys.stderr.write(f"Protocol {protocol_id} status changed to {thread_protocol.status}, stopping workflow\n")
                    break
                
                # Check if we've hit a finish condition in the event
                if isinstance(event, dict):
                    should_finish = False
                    for node_name, node_data in event.items():
                        if isinstance(node_data, dict):
                            if node_data.get("next_agent") == "finish":
                                sys.stderr.write(f"Workflow reached finish condition at node {node_name}\n")
                                # Ensure status is updated before finishing
                                if thread_protocol.status not in ["awaiting_approval", "approved", "rejected"]:
                                    thread_protocol.status = "awaiting_approval"
                                    thread_db.commit()
                                should_finish = True
                                break
                            # Also check status in node data
                            if node_data.get("status") == "awaiting_approval":
                                sys.stderr.write(f"Workflow reached awaiting_approval status at node {node_name}\n")
                                thread_protocol.status = "awaiting_approval"
                                thread_db.commit()
                                should_finish = True
                                break
                    if should_finish:
                        break
            
            sys.stderr.write(f"Workflow completed for protocol {protocol_id} after {event_count} events\n")
        except Exception as e:
            # Log error and update protocol status
            error_msg = f"Workflow error: {str(e)}\n{traceback.format_exc()}"
            sys.stderr.write(error_msg + "\n")
            try:
                save_agent_thought(
                    thread_db, protocol_id, "supervisor", "Supervisor",
                    f"Workflow failed: {str(e)}",
                    "feedback"
                )
                thread_protocol = thread_db.query(Protocol).filter(Protocol.id == protocol_id).first()
                if thread_protocol:
                    thread_protocol.status = "rejected"
                    thread_db.commit()
            except Exception as db_error:
                sys.stderr.write(f"Error updating protocol status: {str(db_error)}\n")
        finally:
            thread_db.close()
    
    # Run in background thread
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(run_sync)
    
    return future


def resume_interrupted_workflows(db: Session):
    """Resume any workflows that were interrupted (e.g., by server crash)."""
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
            sys.stderr.write(f"Failed to resume protocol {protocol.id}: {str(e)}\n")
            protocol.status = "rejected"
            db.commit()

