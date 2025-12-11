"""Supervisor agent node: routes to appropriate agent based on state."""
from datetime import datetime
from app.agents.state import ProtocolState
from app.utils.protocol_state import sync_state_from_db, update_protocol_status
from app.services.protocol_service import ProtocolService
from app.agents.nodes.common import save_agent_thought
from app.utils.llm import get_llm
from app.utils.json_parser import parse_json_response
from sqlalchemy.orm import Session


def supervisor_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Supervisor agent: routes to appropriate agent based on state."""
    protocol_id = state["protocol_id"]
    
    # Initialize agent_notes if not present
    if "agent_notes" not in state:
        state["agent_notes"] = []
    
    # Always sync state from database first to get latest metrics
    state = sync_state_from_db(state, db)
    
    # Clear any invalid next_agent from previous agents (they return via edges, not routing)
    # Supervisor is the entry point and routing decision maker, not a routing destination
    if state.get("next_agent") == "supervisor":
        state["next_agent"] = None  # Will be set by routing logic below
    
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
        state["agent_notes"].append({
            "role": "supervisor",
            "content": "Protocol ready for human approval. Finishing workflow.",
            "timestamp": datetime.utcnow().isoformat()
        })
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Protocol is ready for human approval. Finishing workflow.",
            "action"
        )
    elif not state["current_draft"] or state["current_draft"].strip() == "":
        # No draft yet, start with drafter
        state["next_agent"] = "drafter"
        state["agent_notes"].append({
            "role": "supervisor",
            "content": "No draft exists. Routing to Drafter to create initial draft.",
            "timestamp": datetime.utcnow().isoformat()
        })
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "No draft exists. Routing to Drafter to create initial draft.",
            "action"
        )
    elif state["needs_revision"]:
        # Needs revision, go back to drafter
        state["next_agent"] = "drafter"
        state["needs_revision"] = False
        revision_note = f"Revision needed: {', '.join(state['revision_reasons'])}. Routing to Drafter."
        state["agent_notes"].append({
            "role": "supervisor",
            "content": revision_note,
            "timestamp": datetime.utcnow().isoformat()
        })
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            revision_note,
            "action"
        )
    elif iteration >= 1 and state["current_draft"] and len(state["current_draft"].strip()) > 100:
        # Get visit counts for all agents to prevent infinite loops
        safety_visits = ProtocolService.get_agent_visit_count(db, protocol_id, "safety_guardian")
        critic_visits = ProtocolService.get_agent_visit_count(db, protocol_id, "clinical_critic")
        drafter_visits = ProtocolService.get_agent_visit_count(db, protocol_id, "drafter")
        has_been_to_safety = safety_visits > 0
        has_been_to_critic = critic_visits > 0
        
        # Sync state from database to ensure we have latest metrics
        state = sync_state_from_db(state, db)
        
        # Safety limits to prevent infinite loops
        max_iterations = 5  # Increased to allow more iterations for quality refinement
        max_visits_per_agent = 3  # Increased to allow more agent visits
        
        # CRITICAL: Check if Clinical Critic needs to be called BEFORE checking limits
        # This ensures Clinical Critic is always called after Safety Guardian, regardless of safety score
        safety_score = state["safety_score"].get("score", 0)
        
        # Debug logging
        import sys
        sys.stderr.write(f"Supervisor routing check: iteration={iteration}, safety_visits={safety_visits}, critic_visits={critic_visits}, safety_score={safety_score}, has_been_to_safety={has_been_to_safety}, has_been_to_critic={has_been_to_critic}\n")
        
        # MANDATORY: Clinical Critic must be called after Safety Guardian completes
        # This check happens FIRST, before any limits or LLM reasoning
        if (has_been_to_safety and 
            not has_been_to_critic and 
            critic_visits < max_visits_per_agent and
            safety_score > 0):  # Safety has been reviewed (score > 0 means review completed)
            # Force route to Clinical Critic - this is mandatory after Safety Guardian
            sys.stderr.write(f"Routing to Clinical Critic: Safety Guardian completed (score: {safety_score}), Clinical Critic not yet called\n")
            state["next_agent"] = "clinical_critic"
            state["agent_notes"].append({
                "role": "supervisor",
                "content": f"Safety Guardian has completed review (score: {safety_score}/100). Routing to Clinical Critic for empathy and tone review.",
                "timestamp": datetime.utcnow().isoformat()
            })
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                f"Safety Guardian has completed review (score: {safety_score}/100). Routing to Clinical Critic for empathy and tone review.",
                "action"
            )
        # Check if we've hit safety limits (hard limit, no LLM needed)
        # BUT only if Clinical Critic has already been called (or doesn't need to be called)
        # Note: iteration is 0-indexed, so iteration 3 means 4th iteration (0,1,2,3)
        elif (iteration > max_iterations or 
              safety_visits > max_visits_per_agent or 
              (critic_visits >= max_visits_per_agent and has_been_to_critic)):
            sys.stderr.write(f"Workflow limits reached: iteration={iteration} (max={max_iterations}), safety_visits={safety_visits} (max={max_visits_per_agent}), critic_visits={critic_visits} (max={max_visits_per_agent})\n")
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status(db, protocol_id, "awaiting_approval")
            state["agent_notes"].append({
                "role": "supervisor",
                "content": "Maximum workflow limits reached. Ready for human approval.",
                "timestamp": datetime.utcnow().isoformat()
            })
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                "Maximum workflow limits reached. Ready for human approval.",
                "action"
            )
        else:
            # Use LLM-based reasoning for autonomous routing decisions
            try:
                # Build context from scratchpad
                scratchpad_context = ""
                if state.get("agent_notes"):
                    scratchpad_context = "\n\nPrevious Agent Notes:\n"
                    for note in state["agent_notes"][-10:]:  # Last 10 notes
                        scratchpad_context += f"- [{note['role']}]: {note['content']}\n"
                
                # Build comprehensive prompt for LLM reasoning
                prompt = f"""You are a clinical review board supervisor managing a multi-agent protocol generation system. Your role is to make autonomous routing decisions based on the current state of the protocol review process.

CURRENT STATE:
- Iteration: {iteration} (max: {max_iterations})
- Protocol Type: {state['protocol_type']}
- Intent: {state['intent']}
- Draft Length: {len(state['current_draft'])} characters
- Status: {state['status']}

AGENT VISIT HISTORY:
- Drafter: {drafter_visits} visit(s)
- Safety Guardian: {safety_visits} visit(s) (max: {max_visits_per_agent})
- Clinical Critic: {critic_visits} visit(s) (max: {max_visits_per_agent})

CURRENT METRICS:
- Safety Score: {state['safety_score'].get('score', 0)}/100
- Safety Flags: {len(state['safety_score'].get('flags', []))} flag(s)
- Safety Notes: {state['safety_score'].get('notes', 'N/A')[:200]}
- Empathy Score: {state['empathy_metrics'].get('score', 0)}/100
- Empathy Tone: {state['empathy_metrics'].get('tone', 'N/A')}
- Empathy Suggestions: {len(state['empathy_metrics'].get('suggestions', []))} suggestion(s)

REVISION STATUS:
- Needs Revision: {state.get('needs_revision', False)}
- Revision Reasons: {', '.join(state.get('revision_reasons', [])) if state.get('revision_reasons') else 'None'}

{scratchpad_context}

YOUR TASK:
Analyze the current state and make an autonomous routing decision. Consider:
1. What has been reviewed so far?
2. What still needs to be done?
3. Are the quality metrics acceptable?
4. Is the protocol ready for human approval, or does it need more work?
5. Which agent should be engaged next, if any?

AVAILABLE ROUTING OPTIONS:
- "drafter": Route to Drafter for creating/revising the protocol
- "safety_guardian": Route to Safety Guardian for safety review
- "clinical_critic": Route to Clinical Critic for empathy and tone review
- "finish": Protocol is ready for human approval (use when quality is acceptable or all reviews are complete)

DECISION CRITERIA (IMPORTANT - FOLLOW THIS SEQUENCE):
1. FIRST: Safety review must happen before empathy review
   - If safety score is 0 or not set → route to "safety_guardian"
   - Do NOT route to clinical_critic until safety is reviewed
   
2. SECOND: After safety review completes (safety_visits > 0) - THIS IS MANDATORY:
   - ALWAYS route to "clinical_critic" if Safety Guardian has reviewed (safety_score > 0) and Clinical Critic hasn't been called yet
   - This applies REGARDLESS of the safety score (even if 75, 60, etc.)
   - The only exception: if safety score is 0 (review not completed yet)
   
3. THIRD: After both reviews complete:
   - If safety >= 80 AND empathy >= 70 → route to "finish" (ready for approval)
   - If both agents have reviewed but scores are borderline → route to "finish" (human can review)
   - If safety < 80 OR empathy < 70 → route to "drafter" for revision
   
4. REVISION: Only after BOTH reviews are complete:
   - If safety < 80 → route to "drafter" for revision
   - If empathy < 70 → route to "drafter" for revision

CRITICAL RULE: The workflow sequence MUST be: Drafter → Safety Guardian → Clinical Critic → (then decide)
- Clinical Critic MUST be called after Safety Guardian completes, regardless of safety score
- Do NOT route to "finish" or "drafter" if Clinical Critic hasn't reviewed yet (unless safety is 0)
- Both agents must review before making final decisions about revision or approval

Provide your decision in JSON format ONLY:
{{
    "next_agent": "safety_guardian",
    "reasoning": "Detailed explanation of your routing decision and why this is the best next step",
    "is_ready": false,
    "confidence": "high"
}}

Where:
- "next_agent" must be one of: "drafter", "safety_guardian", "clinical_critic", or "finish"
- "reasoning" explains your autonomous decision-making process
- "is_ready" indicates if protocol is ready for human approval
- "confidence" is "high", "medium", or "low"

Return ONLY valid JSON, no other text."""

                # Get LLM decision
                llm = get_llm()
                response = llm.invoke(prompt)
                response_text = response.content if hasattr(response, 'content') else str(response)
                
                # Parse LLM response
                default_decision = {
                    "next_agent": "finish",
                    "reasoning": "Failed to parse LLM response, defaulting to finish",
                    "is_ready": True,
                    "confidence": "low"
                }
                decision = parse_json_response(response_text, default_decision)
                
                # Extract decision
                next_agent = decision.get("next_agent", "finish")
                reasoning = decision.get("reasoning", "No reasoning provided")
                is_ready = decision.get("is_ready", False)
                
                # Validate next_agent
                valid_agents = ["drafter", "safety_guardian", "clinical_critic", "finish"]
                if next_agent not in valid_agents:
                    next_agent = "finish"
                    reasoning = f"Invalid agent '{decision.get('next_agent')}' returned, defaulting to finish"
                
                # Post-decision validation: Ensure Clinical Critic is called when appropriate
                # This ensures the workflow sequence is followed even if LLM makes a mistake
                safety_score = state["safety_score"].get("score", 0)
                empathy_score = state["empathy_metrics"].get("score", 0)
                
                # CRITICAL RULE: Clinical Critic MUST be called after Safety Guardian completes
                # This ensures empathy review happens regardless of safety score (unless safety is critically low)
                # The workflow sequence should be: Safety Guardian → Clinical Critic → (then decide on revision if needed)
                if (has_been_to_safety and 
                    not has_been_to_critic and 
                    critic_visits < max_visits_per_agent and
                    safety_score > 0):  # Safety has been reviewed (score > 0 means review completed)
                    # Override LLM decision - Clinical Critic must be called after Safety Guardian
                    # This applies regardless of safety score (even if 75, 60, etc.)
                    if next_agent == "finish" or next_agent == "drafter":
                        next_agent = "clinical_critic"
                        reasoning = f"Override: Safety Guardian has completed review (score: {safety_score}/100). Clinical Critic must review before finishing or revising. {reasoning}"
                        is_ready = False
                
                # If safety is critically low (< 50), route to drafter for revision AFTER Clinical Critic
                # But only if Clinical Critic has already reviewed
                elif (has_been_to_critic and
                      safety_score > 0 and 
                      safety_score < 50 and 
                      not state.get("needs_revision", False)):
                    # Both reviews done, but safety is critically low - needs urgent revision
                    next_agent = "drafter"
                    state["needs_revision"] = True
                    if "Critical safety issues" not in state.get("revision_reasons", []):
                        state["revision_reasons"] = state.get("revision_reasons", [])
                        state["revision_reasons"].append("Critical safety issues (score < 50)")
                    reasoning = f"Override: Both reviews complete, but safety score ({safety_score}/100) is critically low. Routing to Drafter for urgent revision. {reasoning}"
                    is_ready = False
                
                # Apply decision
                if next_agent == "finish" or is_ready:
                    state["next_agent"] = "finish"
                    state["status"] = "awaiting_approval"
                    state["should_halt"] = True
                    update_protocol_status(db, protocol_id, "awaiting_approval")
                    message = f"Protocol review complete. {reasoning}"
                else:
                    state["next_agent"] = next_agent
                    message = f"Routing decision: {reasoning}"
                
                # Save supervisor's reasoning
                state["agent_notes"].append({
                    "role": "supervisor",
                    "content": message,
                    "timestamp": datetime.utcnow().isoformat()
                })
                save_agent_thought(
                    db, protocol_id, "supervisor", "Supervisor",
                    message,
                    "action"
                )
                
            except Exception as e:
                # Fallback to rule-based logic if LLM fails
                import sys
                sys.stderr.write(f"Supervisor LLM reasoning failed: {str(e)}\n")
                
                # Fallback logic
                if not has_been_to_safety:
                    state["next_agent"] = "safety_guardian"
                    message = "Initial draft complete. Routing to Safety Guardian for review (fallback)."
                elif state["safety_score"]["score"] >= 80 and not has_been_to_critic:
                    state["next_agent"] = "clinical_critic"
                    message = "Safety review passed. Routing to Clinical Critic for review (fallback)."
                elif state["safety_score"]["score"] >= 80 and state["empathy_metrics"]["score"] >= 70:
                    state["next_agent"] = "finish"
                    state["status"] = "awaiting_approval"
                    state["should_halt"] = True
                    update_protocol_status(db, protocol_id, "awaiting_approval")
                    message = "Protocol meets quality thresholds (fallback)."
                elif has_been_to_safety and has_been_to_critic:
                    state["next_agent"] = "finish"
                    state["status"] = "awaiting_approval"
                    state["should_halt"] = True
                    update_protocol_status(db, protocol_id, "awaiting_approval")
                    message = "Review complete (fallback)."
                else:
                    state["next_agent"] = "finish"
                    state["status"] = "awaiting_approval"
                    state["should_halt"] = True
                    update_protocol_status(db, protocol_id, "awaiting_approval")
                    message = f"Workflow complete (fallback after LLM error: {str(e)[:100]})."
                
                save_agent_thought(
                    db, protocol_id, "supervisor", "Supervisor",
                    message,
                    "action"
                )
    elif state["safety_score"]["score"] < 80 and state["safety_score"]["score"] > 0:
        # Safety score too low, needs revision
        state["next_agent"] = "drafter"
        state["needs_revision"] = True
        state["revision_reasons"].append("Safety score below threshold")
        state["agent_notes"].append({
            "role": "supervisor",
            "content": "Safety score below threshold. Routing to Drafter for revision.",
            "timestamp": datetime.utcnow().isoformat()
        })
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
        state["agent_notes"].append({
            "role": "supervisor",
            "content": "Empathy score below threshold. Routing to Drafter for revision.",
            "timestamp": datetime.utcnow().isoformat()
        })
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Empathy score below threshold. Routing to Drafter for revision.",
            "action"
        )
    else:
        # Max iterations reached or no more refinement needed, finish for approval
        state["next_agent"] = "finish"
        state["status"] = "awaiting_approval"
        state["should_halt"] = True
        update_protocol_status(db, protocol_id, "awaiting_approval")
        state["agent_notes"].append({
            "role": "supervisor",
            "content": "Maximum iterations reached. Protocol ready for human approval.",
            "timestamp": datetime.utcnow().isoformat()
        })
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Maximum iterations reached. Protocol ready for human approval.",
            "action"
        )
    
    # Safety check: ensure next_agent is always set to a valid value after routing logic
    # This should never trigger if routing logic works correctly, but acts as a safety net
    if "next_agent" not in state or state["next_agent"] is None or state["next_agent"] not in ["drafter", "safety_guardian", "clinical_critic", "halt", "finalize", "finish"]:
        # This should not happen - log error and finish workflow safely
        import sys
        sys.stderr.write(f"ERROR: Supervisor routing logic failed to set valid next_agent. State: {state.get('next_agent')}, Status: {state.get('status')}\n")
        state["next_agent"] = "finish"
        state["status"] = "awaiting_approval"
        state["should_halt"] = True
        update_protocol_status(db, protocol_id, "awaiting_approval")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Supervisor routing error detected. Finishing workflow for safety.",
            "feedback"
        )
    
    # Final safety check: prevent routing to agents that have exceeded visit limits
    # This prevents the workflow from calling an agent more than max_visits_per_agent times
    if state.get("next_agent") == "clinical_critic":
        # Re-check visit count right before routing to ensure we haven't exceeded limit
        current_critic_visits = ProtocolService.get_agent_visit_count(db, protocol_id, "clinical_critic")
        if current_critic_visits >= max_visits_per_agent:
            sys.stderr.write(f"WARNING: Blocking Clinical Critic routing - visit limit reached ({current_critic_visits}/{max_visits_per_agent})\n")
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status(db, protocol_id, "awaiting_approval")
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                f"Clinical Critic visit limit reached ({current_critic_visits}/{max_visits_per_agent}). Finishing workflow.",
                "action"
            )
    elif state.get("next_agent") == "safety_guardian":
        # Re-check visit count for Safety Guardian too
        current_safety_visits = ProtocolService.get_agent_visit_count(db, protocol_id, "safety_guardian")
        if current_safety_visits >= max_visits_per_agent:
            sys.stderr.write(f"WARNING: Blocking Safety Guardian routing - visit limit reached ({current_safety_visits}/{max_visits_per_agent})\n")
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status(db, protocol_id, "awaiting_approval")
            save_agent_thought(
                db, protocol_id, "supervisor", "Supervisor",
                f"Safety Guardian visit limit reached ({current_safety_visits}/{max_visits_per_agent}). Finishing workflow.",
                "action"
            )
    
    state["last_agent"] = "supervisor"
    return state

