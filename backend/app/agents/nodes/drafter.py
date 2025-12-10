"""Drafter agent node: creates and revises protocol drafts using LLM."""
from datetime import datetime, timezone
from app.agents.state import ProtocolState
from app.agents.nodes.common import save_agent_thought
from app.utils.llm import get_llm
from app.models.protocol import Protocol, ProtocolVersion
from sqlalchemy.orm import Session


def drafter_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Drafter agent: creates and revises protocol drafts using LLM."""
    protocol_id = state["protocol_id"]
    
    save_agent_thought(
        db, protocol_id, "drafter", "Drafter",
        "Starting draft creation/revision process.",
        "thought"
    )
    
    # Build prompt based on state
    if state["needs_revision"] and state["revision_reasons"]:
        prompt = f"""You are a clinical protocol drafter specializing in Cognitive Behavioral Therapy (CBT) exercises.

Your task is to {'revise' if state['current_draft'] else 'create'} a CBT protocol based on the following requirements:

Protocol Type: {state['protocol_type']}
Intent: {state['intent']}

{'REVISION NEEDED: ' + ', '.join(state['revision_reasons']) if state['revision_reasons'] else ''}

{'Current Draft:' if state['current_draft'] else ''}
{state['current_draft'] if state['current_draft'] else 'No draft exists yet.'}

{'Safety Feedback:' if state.get('safety_score', {}).get('notes') else ''}
{state.get('safety_score', {}).get('notes', '')}

{'Empathy Feedback:' if state.get('empathy_metrics', {}).get('suggestions') else ''}
{chr(10).join('- ' + s for s in state.get('empathy_metrics', {}).get('suggestions', []))}

Create a comprehensive, structured CBT protocol that:
1. Is safe and appropriate for clinical use
2. Uses empathetic, supportive language
3. Is well-structured with clear steps
4. Addresses the specific intent and protocol type
5. Follows evidence-based CBT principles

Format the protocol as clear, actionable steps that a clinician can use with a patient."""
    else:
        prompt = f"""You are a clinical protocol drafter specializing in Cognitive Behavioral Therapy (CBT) exercises.

Create a comprehensive CBT protocol based on:

Protocol Type: {state['protocol_type']}
Intent: {state['intent']}

The protocol should be:
- Safe and appropriate for clinical use
- Written in empathetic, supportive language
- Well-structured with clear, actionable steps
- Evidence-based and following CBT principles
- Tailored to the specific intent provided

Format as clear, actionable steps that a clinician can use with a patient."""
    
    try:
        llm = get_llm()
        response = llm.invoke(prompt)
        draft_content = response.content if hasattr(response, 'content') else str(response)
        
        state["current_draft"] = draft_content
        # Only increment iteration if we actually created new content
        if not state.get("needs_revision") or state["iteration_count"] == 0:
            state["iteration_count"] += 1
        
        # Update protocol in database
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if protocol:
            protocol.current_draft = draft_content
            protocol.iteration_count = state["iteration_count"]
            protocol.status = "reviewing"
        
        # Create version record
        version = ProtocolVersion(
            protocol_id=protocol_id,
            version=state["iteration_count"],
            content=draft_content,
            author="drafter",
            timestamp=datetime.now(timezone.utc),  # Explicitly set current UTC time
        )
        db.add(version)
        db.commit()
        
        save_agent_thought(
            db, protocol_id, "drafter", "Drafter",
            f"Draft created/revised (version {state['iteration_count']}). Length: {len(draft_content)} characters.",
            "action"
        )
        
        # Clear revision flags on success
        state["needs_revision"] = False
        state["revision_reasons"] = []
        
    except Exception as e:
        error_msg = str(e)
        # Check if it's a 503 or API error
        is_api_error = "503" in error_msg or "unreachable_backend" in error_msg or "Internal server error" in error_msg
        
        # Truncate error message for display
        display_error = error_msg[:150] + "..." if len(error_msg) > 150 else error_msg
        
        save_agent_thought(
            db, protocol_id, "drafter", "Drafter",
            f"Error during draft creation: {display_error}",
            "feedback"
        )
        
        # Don't loop forever on API errors - mark as failed after a few attempts
        error_count = len([r for r in state.get("revision_reasons", []) if "Drafting error" in r or "503" in r])
        if is_api_error and error_count >= 2:
            # Too many API errors, halt the workflow
            state["status"] = "rejected"
            state["next_agent"] = "halt"
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Too many API errors (503). Workflow halted. The LLM API may be temporarily unavailable. Please try again later or check your API key.",
                "feedback"
            )
            protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
            if protocol:
                protocol.status = "rejected"
                db.commit()
        else:
            # Only add revision reason if not already there
            error_reason = f"Drafting error: {error_msg[:80]}"
            if error_reason not in state.get("revision_reasons", []):
                if "revision_reasons" not in state:
                    state["revision_reasons"] = []
                state["needs_revision"] = True
                state["revision_reasons"].append(error_reason)
    
    state["last_agent"] = "drafter"
    state["next_agent"] = "supervisor"
    return state

