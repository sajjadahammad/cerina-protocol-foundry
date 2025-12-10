"""Agent node functions for the LangGraph workflow."""
from typing import Dict, Any
from langchain_mistralai import ChatMistralAI
from app.config import settings
from app.agents.state import ProtocolState
from app.models.protocol import ProtocolVersion, AgentThought
from sqlalchemy.orm import Session
from datetime import datetime
import json


# Initialize Mistral LLM
def get_mistral_llm() -> ChatMistralAI:
    """Get configured Mistral LLM instance."""
    if not settings.MISTRAL_API_KEY:
        raise ValueError("MISTRAL_API_KEY not configured")
    return ChatMistralAI(
        model=settings.MISTRAL_MODEL,
        mistral_api_key=settings.MISTRAL_API_KEY,
        temperature=0.7,
    )


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
    iteration = state["iteration_count"]
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        f"Reviewing state at iteration {iteration}. Current status: {state['status']}",
        "thought"
    )
    
    # Routing logic
    if state["should_halt"] or state["status"] == "awaiting_approval":
        state["next_agent"] = "halt"
        state["status"] = "awaiting_approval"
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Protocol is ready for human approval. Halting workflow.",
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
    elif iteration == 0:
        # First iteration: draft -> safety -> critic
        state["next_agent"] = "safety_guardian"
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Initial draft complete. Routing to Safety Guardian for review.",
            "action"
        )
    elif state["safety_score"]["score"] < 80:
        # Safety score too low, needs revision
        state["next_agent"] = "drafter"
        state["needs_revision"] = True
        state["revision_reasons"].append("Safety score below threshold")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Safety score below threshold. Routing to Drafter for revision.",
            "action"
        )
    elif state["empathy_metrics"]["score"] < 70:
        # Empathy score too low, needs revision
        state["next_agent"] = "drafter"
        state["needs_revision"] = True
        state["revision_reasons"].append("Empathy score below threshold")
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Empathy score below threshold. Routing to Drafter for revision.",
            "action"
        )
    elif iteration < 3:
        # Continue refinement cycle
        state["next_agent"] = "clinical_critic"
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Continuing refinement cycle. Routing to Clinical Critic.",
            "action"
        )
    else:
        # Max iterations reached, halt for approval
        state["next_agent"] = "halt"
        state["status"] = "awaiting_approval"
        state["should_halt"] = True
        save_agent_thought(
            db, protocol_id, "supervisor", "Supervisor",
            "Maximum iterations reached. Protocol ready for human approval.",
            "action"
        )
    
    state["last_agent"] = "supervisor"
    return state


def drafter_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Drafter agent: creates and revises protocol drafts using Mistral."""
    protocol_id = state["protocol_id"]
    llm = get_mistral_llm()
    
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
        response = llm.invoke(prompt)
        draft_content = response.content if hasattr(response, 'content') else str(response)
        
        state["current_draft"] = draft_content
        state["iteration_count"] += 1
        
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
        
    except Exception as e:
        save_agent_thought(
            db, protocol_id, "drafter", "Drafter",
            f"Error during draft creation: {str(e)}",
            "feedback"
        )
        state["needs_revision"] = True
        state["revision_reasons"].append(f"Drafting error: {str(e)}")
    
    state["last_agent"] = "drafter"
    state["next_agent"] = "supervisor"
    return state


def safety_guardian_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Safety Guardian agent: checks for safety issues and medical advice."""
    protocol_id = state["protocol_id"]
    llm = get_mistral_llm()
    
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
    llm = get_mistral_llm()
    
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
    
    save_agent_thought(
        db, protocol_id, "supervisor", "Supervisor",
        "Workflow halted. Waiting for human approval.",
        "action"
    )
    
    state["status"] = "awaiting_approval"
    state["should_halt"] = True
    state["next_agent"] = "finish"
    
    return state

