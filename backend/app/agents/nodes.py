"""Agent node functions for the LangGraph workflow."""
from typing import Dict, Any, Union
from app.config import settings
from app.agents.state import ProtocolState
from app.models.protocol import ProtocolVersion, AgentThought
from sqlalchemy.orm import Session
from datetime import datetime
import json

# Import LLM providers
USE_NEW_HUGGINGFACE = False
try:
    from langchain_huggingface import ChatHuggingFace
    from langchain_huggingface.llms import HuggingFaceEndpoint
    USE_NEW_HUGGINGFACE = True
except ImportError:
    try:
        from langchain_community.llms import HuggingFaceEndpoint
        from langchain_community.chat_models import ChatHuggingFace
    except ImportError:
        ChatHuggingFace = None
        HuggingFaceEndpoint = None

# Commented out Mistral - can re-enable by setting LLM_PROVIDER=mistral
# try:
#     from langchain_mistralai import ChatMistralAI
# except ImportError:
#     ChatMistralAI = None


# Initialize Qwen 2.5 Pro via Hugging Face
def get_huggingface_llm():
    """Get configured Hugging Face LLM instance (Qwen 2.5 Pro)."""
    if not ChatHuggingFace:
        raise ValueError("langchain-community or langchain-huggingface not installed. Run: pip install langchain-community langchain-huggingface")
    
    if not settings.HUGGINGFACE_API_KEY:
        raise ValueError("HUGGINGFACE_API_KEY not configured")
    
    # New langchain_huggingface API requires wrapping HuggingFaceEndpoint
    if USE_NEW_HUGGINGFACE:
        if not HuggingFaceEndpoint:
            raise ValueError("HuggingFaceEndpoint not available. Run: pip install langchain-huggingface")
        llm = HuggingFaceEndpoint(
            repo_id=settings.HUGGINGFACE_MODEL,
            huggingfacehub_api_token=settings.HUGGINGFACE_API_KEY,
            temperature=0.7,
            max_new_tokens=4096,
        )
        return ChatHuggingFace(llm=llm)
    else:
        # Deprecated langchain_community API accepts direct parameters
        return ChatHuggingFace(
            model=settings.HUGGINGFACE_MODEL,
            huggingfacehub_api_token=settings.HUGGINGFACE_API_KEY,
            temperature=0.7,
            max_tokens=4096,
        )


# Commented out Mistral LLM - can switch back by setting LLM_PROVIDER=mistral
# def get_mistral_llm() -> ChatMistralAI:
#     """Get configured Mistral LLM instance."""
#     if not ChatMistralAI:
#         raise ValueError("langchain_mistralai not installed. Run: pip install langchain-mistralai")
#     if not settings.MISTRAL_API_KEY:
#         raise ValueError("MISTRAL_API_KEY not configured")
#     return ChatMistralAI(
#         model=settings.MISTRAL_MODEL,
#         mistral_api_key=settings.MISTRAL_API_KEY,
#         temperature=0.7,
#     )


# Unified LLM getter - switches based on LLM_PROVIDER setting
def get_llm():
    """Get the configured LLM instance based on LLM_PROVIDER setting."""
    provider = settings.LLM_PROVIDER.lower()
    
    if provider == "huggingface":
        return get_huggingface_llm()
    # elif provider == "mistral":
    #     return get_mistral_llm()
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}. Use 'huggingface' or 'mistral'")


def save_agent_thought(
    db: Session,
    protocol_id: str,
    agent_role: str,
    agent_name: str,
    content: str,
    thought_type: str = "thought"
):
    """Save an agent thought to the database."""
    thought = AgentThought(
        protocol_id=protocol_id,
        agent_role=agent_role,
        agent_name=agent_name,
        content=content,
        type=thought_type,
    )
    db.add(thought)
    db.commit()


def supervisor_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Supervisor agent: routes to appropriate agent based on state."""
    protocol_id = state["protocol_id"]
    
    # Always sync state from database first to get latest metrics
    from app.models.protocol import Protocol
    db_protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if db_protocol:
        # Sync all state from database
        state["current_draft"] = db_protocol.current_draft or state.get("current_draft", "")
        state["safety_score"] = db_protocol.safety_score or state.get("safety_score", {"score": 0, "flags": [], "notes": ""})
        state["empathy_metrics"] = db_protocol.empathy_metrics or state.get("empathy_metrics", {"score": 0, "tone": "", "suggestions": []})
        state["iteration_count"] = db_protocol.iteration_count or state.get("iteration_count", 0)
        state["status"] = db_protocol.status or state.get("status", "drafting")
        # Derive is_approved and should_halt from status (not stored as separate columns)
        state["is_approved"] = db_protocol.status == "approved"
        state["should_halt"] = db_protocol.status == "awaiting_approval"
    
    iteration = state["iteration_count"]
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        f"Reviewing state at iteration {iteration}. Current status: {state['status']}. Safety: {state['safety_score'].get('score', 0)}, Empathy: {state['empathy_metrics'].get('score', 0)}",
        "thought"
    )
    
    # Helper function to persist status change to database
    def update_protocol_status(new_status: str):
        from app.models.protocol import Protocol
        db_protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if db_protocol and db_protocol.status != new_status:
            db_protocol.status = new_status
            db.commit()
            print(f"Protocol {protocol_id} status updated to {new_status}")
    
    # Routing logic - check halt condition first to prevent loops
    if state["should_halt"] or state["status"] == "awaiting_approval":
        state["next_agent"] = "finish"  # Go directly to finish, not halt again
        state["status"] = "awaiting_approval"
        update_protocol_status("awaiting_approval")
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
        # Check if we've been to safety_guardian and clinical_critic by querying database
        from app.models.protocol import AgentThought
        safety_thoughts = db.query(AgentThought).filter(
            AgentThought.protocol_id == protocol_id,
            AgentThought.agent_role == "safety_guardian"
        ).count()
        critic_thoughts = db.query(AgentThought).filter(
            AgentThought.protocol_id == protocol_id,
            AgentThought.agent_role == "clinical_critic"
        ).count()
        
        has_been_to_safety = safety_thoughts > 0
        has_been_to_critic = critic_thoughts > 0
        
        # Also sync state from database to ensure we have latest metrics
        from app.models.protocol import Protocol
        db_protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if db_protocol:
            if db_protocol.safety_score:
                state["safety_score"] = db_protocol.safety_score
            if db_protocol.empathy_metrics:
                state["empathy_metrics"] = db_protocol.empathy_metrics
            if db_protocol.current_draft:
                state["current_draft"] = db_protocol.current_draft
            state["iteration_count"] = db_protocol.iteration_count
        
        # Prevent infinite loops - if we've done too many iterations, finish
        if iteration >= 5:
            state["next_agent"] = "finish"
            state["status"] = "awaiting_approval"
            state["should_halt"] = True
            update_protocol_status("awaiting_approval")
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
            update_protocol_status("awaiting_approval")
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
            update_protocol_status("awaiting_approval")
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
        update_protocol_status("awaiting_approval")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Maximum iterations reached. Protocol ready for human approval.",
            "action"
        )
    
    state["last_agent"] = "supervisor"
    return state


def drafter_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Drafter agent: creates and revises protocol drafts using LLM (Qwen 2.5 Pro via Hugging Face)."""
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
        llm = get_llm()  # Switched from get_mistral_llm() to get_llm() - uses Qwen 2.5 Pro via Hugging Face
        response = llm.invoke(prompt)
        draft_content = response.content if hasattr(response, 'content') else str(response)
        
        state["current_draft"] = draft_content
        # Only increment iteration if we actually created new content
        if not state.get("needs_revision") or state["iteration_count"] == 0:
            state["iteration_count"] += 1
        
        # Update protocol in database
        from app.models.protocol import Protocol
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
            from app.models.protocol import Protocol
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


def safety_guardian_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Safety Guardian agent: checks for safety issues and medical advice."""
    protocol_id = state["protocol_id"]
    
    save_agent_thought(
        db, protocol_id, "safety_guardian", "Safety Guardian",
        "Reviewing protocol for safety concerns and inappropriate medical advice.",
        "thought"
    )
    
    prompt = f"""You are a safety guardian reviewing a CBT protocol for potential safety issues.

Review the following protocol draft and identify:
1. Any content that could encourage self-harm or dangerous behaviors
2. Medical advice that should only come from licensed healthcare providers
3. Content that could be harmful or inappropriate
4. Any other safety concerns

Protocol Draft:
{state['current_draft']}

Provide your assessment in JSON format:
{{
    "score": <0-100>,  // Safety score (100 = completely safe, 0 = dangerous)
    "flags": ["flag1", "flag2"],  // List of specific safety concerns
    "notes": "Detailed explanation of safety assessment"
}}

Be thorough but fair. Only flag genuine safety concerns."""
    
    try:
        llm = get_llm()  # Switched from get_mistral_llm() to get_llm() - uses Qwen 2.5 Pro via Hugging Face
        response = llm.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Try to parse JSON from response
        try:
            # Extract JSON from response if it's wrapped in markdown
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            
            safety_data = json.loads(response_text)
        except:
            # Fallback: create safety score from text analysis
            safety_data = {
                "score": 85 if "safe" in response_text.lower() else 60,
                "flags": ["Could not parse detailed safety assessment"],
                "notes": response_text[:500]
            }
        
        state["safety_score"] = {
            "score": safety_data.get("score", 75),
            "flags": safety_data.get("flags", []),
            "notes": safety_data.get("notes", "Safety review completed")
        }
        
        # Update protocol in database
        from app.models.protocol import Protocol
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if protocol:
            protocol.safety_score = state["safety_score"]
            # Don't increment iteration count here - only drafter creates new iterations
            db.commit()
            db.refresh(protocol)
        
        save_agent_thought(
            db, protocol_id, "safety_guardian", "Safety Guardian",
            f"Safety review complete. Score: {state['safety_score']['score']}/100. Flags: {len(state['safety_score']['flags'])}",
            "feedback"
        )
        
        if state["safety_score"]["flags"]:
            save_agent_thought(
                db, protocol_id, "safety_guardian", "Safety Guardian",
                f"Safety flags: {', '.join(state['safety_score']['flags'])}",
                "feedback"
            )
        
    except Exception as e:
        save_agent_thought(
            db, protocol_id, "safety_guardian", "Safety Guardian",
            f"Error during safety review: {str(e)}",
            "feedback"
        )
        state["safety_score"] = {
            "score": 50,  # Conservative default
            "flags": ["Safety review error"],
            "notes": f"Error: {str(e)}"
        }
    
    state["last_agent"] = "safety_guardian"
    state["next_agent"] = "supervisor"
    return state


def clinical_critic_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Clinical Critic agent: evaluates empathy, tone, and structure."""
    protocol_id = state["protocol_id"]
    
    save_agent_thought(
        db, protocol_id, "clinical_critic", "Clinical Critic",
        "Evaluating protocol for empathy, tone, and clinical structure.",
        "thought"
    )
    
    prompt = f"""You are a clinical critic reviewing a CBT protocol for empathy, tone, and structure.

Evaluate the following protocol:
{state['current_draft']}

Assess:
1. Empathy: Is the language warm, supportive, and understanding?
2. Tone: Is it appropriate for a clinical setting? Professional yet compassionate?
3. Structure: Is it well-organized and easy to follow?
4. Clinical quality: Does it follow evidence-based CBT principles?

Provide your assessment in JSON format:
{{
    "score": <0-100>,  // Overall empathy/clinical quality score
    "tone": "description of tone",
    "suggestions": ["suggestion1", "suggestion2"]  // Specific improvement suggestions
}}"""
    
    try:
        llm = get_llm()  # Switched from get_mistral_llm() to get_llm() - uses Qwen 2.5 Pro via Hugging Face
        response = llm.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Try to parse JSON
        try:
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            
            empathy_data = json.loads(response_text)
        except:
            empathy_data = {
                "score": 75,
                "tone": "Generally appropriate",
                "suggestions": ["Could not parse detailed assessment"]
            }
        
        state["empathy_metrics"] = {
            "score": empathy_data.get("score", 75),
            "tone": empathy_data.get("tone", "neutral"),
            "suggestions": empathy_data.get("suggestions", [])
        }
        
        # Update protocol in database
        from app.models.protocol import Protocol
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if protocol:
            protocol.empathy_metrics = state["empathy_metrics"]
            # Don't increment iteration count here - only drafter creates new iterations
            db.commit()
            db.refresh(protocol)
        
        save_agent_thought(
            db, protocol_id, "clinical_critic", "Clinical Critic",
            f"Clinical review complete. Empathy score: {state['empathy_metrics']['score']}/100. Tone: {state['empathy_metrics']['tone']}",
            "feedback"
        )
        
        if state["empathy_metrics"]["suggestions"]:
            save_agent_thought(
                db, protocol_id, "clinical_critic", "Clinical Critic",
                f"Suggestions: {', '.join(state['empathy_metrics']['suggestions'][:3])}",
                "feedback"
            )
        
    except Exception as e:
        save_agent_thought(
            db, protocol_id, "clinical_critic", "Clinical Critic",
            f"Error during clinical review: {str(e)}",
            "feedback"
        )
        state["empathy_metrics"] = {
            "score": 70,
            "tone": "neutral",
            "suggestions": [f"Review error: {str(e)}"]
        }
    
    state["last_agent"] = "clinical_critic"
    state["next_agent"] = "supervisor"
    return state


def halt_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Halt node: pauses workflow for human approval."""
    protocol_id = state["protocol_id"]
    
    # Update protocol in database
    from app.models.protocol import Protocol
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if protocol:
        protocol.status = "awaiting_approval"
        # Save current draft to checkpoint
        protocol.current_draft = state.get("current_draft", "")
        db.commit()
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        "Workflow halted. Waiting for human approval.",
        "action"
    )
    
    state["status"] = "awaiting_approval"
    state["should_halt"] = True
    state["next_agent"] = "finish"
    
    return state


def finalize_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Finalize node: saves the final approved artifact."""
    protocol_id = state["protocol_id"]
    
    # Update protocol in database
    from app.models.protocol import Protocol, ProtocolVersion
    protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
    if protocol:
        # Save final version
        final_version = ProtocolVersion(
            protocol_id=protocol_id,
            version=len(protocol.versions) + 1,
            content=protocol.current_draft or state.get("current_draft", ""),
            author="system"
        )
        db.add(final_version)
        
        # Mark as approved and finalize
        protocol.status = "approved"
        db.commit()
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        "Final artifact saved. Protocol approved and finalized.",
        "action"
    )
    
    state["status"] = "approved"
    state["is_approved"] = True
    state["next_agent"] = "finish"
    
    return state

