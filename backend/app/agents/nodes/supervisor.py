"""Supervisor agent node: routes to appropriate agent based on state."""
from app.agents.state import ProtocolState
from app.utils.protocol_state import sync_state_from_db, update_protocol_status
from app.services.protocol_service import ProtocolService
from app.agents.nodes.common import save_agent_thought
from sqlalchemy.orm import Session


def supervisor_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Supervisor agent: routes to appropriate agent based on state."""
    protocol_id = state["protocol_id"]
    
    # Always sync state from database first to get latest metrics
    state = sync_state_from_db(state, db)
    
    iteration = state["iteration_count"]
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        f"Reviewing state at iteration {iteration}. Current status: {state['status']}. Safety: {state['safety_score'].get('score', 0)}, Empathy: {state['empathy_metrics'].get('score', 0)}",
        "thought"
    )
    
    # Routing logic - check halt condition first to prevent loops
    if state["should_halt"] or state["status"] == "awaiting_approval":
        state["next_agent"] = "finish"
        state["status"] = "awaiting_approval"
        update_protocol_status(db, protocol_id, "awaiting_approval")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Protocol is ready for human approval. Finishing workflow.",
            "action"
        )
    elif not state["current_draft"] or state["current_draft"].strip() == "":
        # No draft yet, start with drafter
        state["next_agent"] = "drafter"
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "No draft exists. Routing to Drafter to create initial draft.",
            "action"
        )
    elif state["needs_revision"]:
        # Needs revision, go back to drafter
        state["next_agent"] = "drafter"
        state["needs_revision"] = False
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            f"Revision needed: {', '.join(state['revision_reasons'])}. Routing to Drafter.",
            "action"
        )
    elif iteration >= 1 and state["current_draft"] and len(state["current_draft"].strip()) > 100:
        # Check if we've been to safety_guardian and clinical_critic
        has_been_to_safety = ProtocolService.has_agent_visited(db, protocol_id, "safety_guardian")
        has_been_to_critic = ProtocolService.has_agent_visited(db, protocol_id, "clinical_critic")
        
        # Sync state from database to ensure we have latest metrics
        state = sync_state_from_db(state, db)
        
        # Prevent infinite loops - if we've done too many iterations, finish
        if iteration >= 5:
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status(db, protocol_id, "awaiting_approval")
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Maximum iterations reached. Protocol ready for human approval.",
                "action"
            )
        elif not has_been_to_safety:
            # First time with valid draft: draft -> safety -> critic
            state["next_agent"] = "safety_guardian"
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Initial draft complete. Routing to Safety Guardian for review.",
                "action"
            )
        elif state["safety_score"]["score"] == 0:
            # Safety score not set yet, go to safety guardian
            state["next_agent"] = "safety_guardian"
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Routing to Safety Guardian for initial safety review.",
                "action"
            )
        elif not has_been_to_critic and state["safety_score"]["score"] >= 80:
            # Safety passed, now go to clinical critic
            state["next_agent"] = "clinical_critic"
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Safety review passed. Routing to Clinical Critic for empathy and tone review.",
                "action"
            )
        elif (state["empathy_metrics"]["score"] == 0 or not has_been_to_critic) and state["safety_score"]["score"] >= 80:
            # Empathy metrics not set yet or Clinical Critic hasn't been called, go to clinical critic
            state["next_agent"] = "clinical_critic"
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Routing to Clinical Critic for empathy and tone review.",
                "action"
            )
        elif state["safety_score"]["score"] >= 80 and state["empathy_metrics"]["score"] >= 70:
            # Both scores are good, finish for approval
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status(db, protocol_id, "awaiting_approval")
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Protocol meets quality thresholds. Ready for human approval.",
                "action"
            )
    elif state["safety_score"]["score"] < 80 and state["safety_score"]["score"] > 0:
        # Safety score too low, needs revision
        state["next_agent"] = "drafter"
        state["needs_revision"] = True
        state["revision_reasons"].append("Safety score below threshold")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Safety score below threshold. Routing to Drafter for revision.",
            "action"
        )
    elif state["empathy_metrics"]["score"] > 0 and state["empathy_metrics"]["score"] < 70:
        # Empathy score too low, needs revision
        state["next_agent"] = "drafter"
        state["needs_revision"] = True
        if "Empathy score below threshold" not in state["revision_reasons"]:
            state["revision_reasons"].append("Empathy score below threshold")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Empathy score below threshold. Routing to Drafter for revision.",
            "action"
        )
    elif iteration < 3 and state["safety_score"]["score"] >= 80:
        # Continue refinement cycle if safety is good
        # Only go to critic if empathy score needs improvement or hasn't been set
        has_been_to_critic = ProtocolService.has_agent_visited(db, protocol_id, "clinical_critic")
        if state["empathy_metrics"]["score"] == 0 or (state["empathy_metrics"]["score"] < 70 and not has_been_to_critic):
            state["next_agent"] = "clinical_critic"
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Continuing refinement cycle. Routing to Clinical Critic.",
                "action"
            )
        else:
            # Both scores are good, finish
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status(db, protocol_id, "awaiting_approval")
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Protocol meets quality thresholds. Ready for human approval.",
                "action"
            )
    else:
        # Max iterations reached or no more refinement needed, finish for approval
        state["next_agent"] = "finish"
        state["status"] = "awaiting_approval"
        state["should_halt"] = True
        update_protocol_status(db, protocol_id, "awaiting_approval")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Maximum iterations reached. Protocol ready for human approval.",
            "action"
        )
    
    state["last_agent"] = "supervisor"
    return state

