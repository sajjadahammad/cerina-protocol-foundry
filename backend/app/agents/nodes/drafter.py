"""Drafter agent node: creates and revises protocol drafts using LLM."""
from datetime import datetime, timezone, timedelta
from app.agents.state import ProtocolState
from app.agents.nodes.common import save_agent_thought
from app.utils.llm import get_llm
from app.models.protocol import Protocol, ProtocolVersion
from sqlalchemy.orm import Session

# IST (Indian Standard Time) is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def drafter_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Drafter agent: creates and revises protocol drafts using LLM."""
    protocol_id = state["protocol_id"]
    
    # Initialize agent_notes if not present
    if "agent_notes" not in state:
        state["agent_notes"] = []
    
    # Determine if this is a creation or revision
    is_revision = state.get("needs_revision", False) or (state.get("current_draft", "").strip() != "")
    thought_message = f"Starting draft {'revision' if is_revision else 'creation'} process."
    
    save_agent_thought(
        db, protocol_id, "drafter", "Drafter",
        thought_message,
        "thought"
    )
    
    # Read previous agent notes from scratchpad for context
    previous_notes = state.get("agent_notes", [])
    scratchpad_context = ""
    if previous_notes:
        scratchpad_context = "\n\nPrevious Agent Notes (for context):\n"
        for note in previous_notes[-10:]:  # Last 10 notes to avoid prompt bloat
            scratchpad_context += f"- [{note['role']}]: {note['content']}\n"
    
    # Get current scores for context
    current_safety_score = state.get('safety_score', {}).get('score', 0)
    current_empathy_score = state.get('empathy_metrics', {}).get('score', 0)
    iteration = state.get('iteration_count', 0)
    
    # Build prompt based on state
    if state["needs_revision"] and state["revision_reasons"]:
        prompt = f"""You are a clinical protocol drafter specializing in Cognitive Behavioral Therapy (CBT) exercises.

Your task is to {'revise' if state['current_draft'] else 'create'} a CBT protocol based on the following requirements:

Protocol Type: {state['protocol_type']}
Intent: {state['intent']}

CURRENT QUALITY SCORES (Iteration {iteration}):
- Safety Score: {current_safety_score}/100
- Empathy Score: {current_empathy_score}/100

IMPORTANT: Your goal is to IMPROVE these scores with each revision. Aim for:
- Safety Score: 80+ (currently {current_safety_score}/100)
- Empathy Score: 70+ (currently {current_empathy_score}/100)

{'REVISION NEEDED: ' + ', '.join(state['revision_reasons']) if state['revision_reasons'] else ''}

{'Current Draft:' if state['current_draft'] else ''}
{state['current_draft'] if state['current_draft'] else 'No draft exists yet.'}

{'Safety Feedback:' if state.get('safety_score', {}).get('notes') else ''}
{state.get('safety_score', {}).get('notes', '')}

{'Safety Flags:' if state.get('safety_score', {}).get('flags') else ''}
{chr(10).join('- ' + str(f) for f in state.get('safety_score', {}).get('flags', [])) if state.get('safety_score', {}).get('flags') else ''}

{'Empathy Feedback:' if state.get('empathy_metrics', {}).get('suggestions') else ''}
{chr(10).join('- ' + s for s in state.get('empathy_metrics', {}).get('suggestions', []))}
{scratchpad_context}

Create a comprehensive, structured CBT protocol that:
1. Addresses ALL safety concerns and flags to improve safety score (target: 80+)
2. Incorporates ALL empathy suggestions to improve empathy score (target: 70+)
3. Is safe and appropriate for clinical use
4. Uses empathetic, supportive language
5. Is well-structured with clear steps
6. Addresses the specific intent and protocol type
7. Follows evidence-based CBT principles

CRITICAL INSTRUCTIONS:
- DO NOT include scores (like "Safety Score: 95/100") in the protocol text. Scores are tracked separately by the system.
- Focus on addressing the specific feedback provided to improve the scores.
- Each revision should show measurable improvement in addressing safety concerns and empathy suggestions.
- If safety flags exist, explicitly address each one in the revised protocol.
- If empathy suggestions exist, incorporate them into the protocol language and structure.

Format the protocol as clear, actionable steps that a clinician can use with a patient."""
    else:
        prompt = f"""You are a clinical protocol drafter specializing in Cognitive Behavioral Therapy (CBT) exercises.

Create a comprehensive CBT protocol based on:

Protocol Type: {state['protocol_type']}
Intent: {state['intent']}
{scratchpad_context}

QUALITY TARGETS:
- Safety Score: Aim for 80+ (addresses all safety concerns, no medical advice, proper boundaries)
- Empathy Score: Aim for 70+ (warm, supportive, culturally sensitive language)

The protocol should be:
- Safe and appropriate for clinical use (target: Safety Score 80+)
- Written in empathetic, supportive language (target: Empathy Score 70+)
- Well-structured with clear, actionable steps
- Evidence-based and following CBT principles
- Tailored to the specific intent provided

CRITICAL INSTRUCTIONS:
- DO NOT include scores (like "Safety Score: 95/100" or "Empathy Score: 98/100") in the protocol text. Scores are tracked separately by the system.
- Focus on creating a high-quality protocol that will score well on safety and empathy metrics.
- Include explicit safety measures (suicidality protocols, medical boundaries, contraindications).
- Use warm, validating, and culturally sensitive language throughout.

Format as clear, actionable steps that a clinician can use with a patient."""
    
    try:
        llm = get_llm()
        
        # Get protocol for incremental updates
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if not protocol:
            raise ValueError(f"Protocol {protocol_id} not found")
        
        # Initialize draft content
        draft_content = ""
        chunk_buffer = ""
        chunk_size = 50  # Update database every N characters for smoother streaming
        
        # Use streaming to get incremental updates
        try:
            # Try streaming first (preferred for real-time updates)
            if hasattr(llm, 'stream'):
                # Stream the response and update database incrementally
                for chunk in llm.stream(prompt):
                    # Handle different chunk types from LangChain
                    if hasattr(chunk, 'content'):
                        chunk_text = chunk.content
                    elif isinstance(chunk, str):
                        chunk_text = chunk
                    else:
                        chunk_text = str(chunk)
                    
                    if chunk_text:
                        draft_content += chunk_text
                        chunk_buffer += chunk_text
                        
                        # Update database periodically for streaming
                        if len(chunk_buffer) >= chunk_size:
                            protocol.current_draft = draft_content
                            protocol.status = "reviewing"
                            db.commit()
                            chunk_buffer = ""  # Reset buffer
            else:
                # Fallback to non-streaming if stream() not available
                response = llm.invoke(prompt)
                draft_content = response.content if hasattr(response, 'content') else str(response)
                protocol.current_draft = draft_content
                protocol.status = "reviewing"
                db.commit()
        except Exception as stream_error:
            # If streaming fails, fall back to non-streaming
            import sys
            sys.stderr.write(f"Streaming failed, falling back to invoke: {stream_error}\n")
            response = llm.invoke(prompt)
            draft_content = response.content if hasattr(response, 'content') else str(response)
            protocol.current_draft = draft_content
            protocol.status = "reviewing"
            db.commit()
        
        # Final update to ensure all content is saved
        state["current_draft"] = draft_content
        protocol.current_draft = draft_content
        protocol.status = "reviewing"
        
        # Always increment iteration count when creating or revising a draft
        # This ensures each draft/revision gets a unique version number
        if state.get("iteration_count", 0) == 0:
            # First draft: set to 1
            state["iteration_count"] = 1
        else:
            # Subsequent drafts/revisions: increment
            state["iteration_count"] += 1
        
        protocol.iteration_count = state["iteration_count"]
        db.commit()
        
        # Write to scratchpad
        state["agent_notes"].append({
            "role": "drafter",
            "content": f"Draft {'revised' if state.get('needs_revision') else 'created'} (version {state['iteration_count']}). Length: {len(draft_content)} characters.",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Create version record
        version = ProtocolVersion(
            protocol_id=protocol_id,
            version=state["iteration_count"],
            content=draft_content,
            author="drafter",
            timestamp=datetime.now(IST),  # Use IST (Indian Standard Time)
        )
        db.add(version)
        db.commit()
        
        # Determine if this is a creation or revision
        is_revision = state.get("needs_revision", False) or (state.get("iteration_count", 0) > 1)
        action_message = f"Draft {'revised' if is_revision else 'created'} (version {state['iteration_count']}). Length: {len(draft_content)} characters."
        
        save_agent_thought(
            db, protocol_id, "drafter", "Drafter",
            action_message,
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
        
        # Write error to scratchpad
        state["agent_notes"].append({
            "role": "drafter",
            "content": f"Error during draft creation: {display_error}",
            "timestamp": datetime.utcnow().isoformat()
        })
        
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
    # Don't set next_agent - we return to supervisor via direct edge, supervisor will set next_agent
    return state

