"""Clinical Critic agent node: evaluates empathy, tone, and structure."""
from app.agents.state import ProtocolState
from app.agents.nodes.common import save_agent_thought
from app.utils.llm import get_llm
from app.utils.json_parser import parse_json_response
from app.models.protocol import Protocol
from sqlalchemy.orm import Session


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
        llm = get_llm()
        response = llm.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON
        default_empathy = {
            "score": 75,
            "tone": "Generally appropriate",
            "suggestions": ["Could not parse detailed assessment"]
        }
        empathy_data = parse_json_response(response_text, default_empathy)
        
        state["empathy_metrics"] = {
            "score": empathy_data.get("score", 75),
            "tone": empathy_data.get("tone", "neutral"),
            "suggestions": empathy_data.get("suggestions", [])
        }
        
        # Update protocol in database
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if protocol:
            protocol.empathy_metrics = state["empathy_metrics"]
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

