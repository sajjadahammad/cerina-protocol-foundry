"""Safety Guardian agent node: checks for safety issues and medical advice."""
from datetime import datetime
from app.agents.state import ProtocolState
from app.agents.nodes.common import save_agent_thought
from app.utils.llm import get_llm
from app.utils.json_parser import parse_json_response
from app.models.protocol import Protocol
from sqlalchemy.orm import Session


def safety_guardian_node(state: ProtocolState, db: Session) -> ProtocolState:
    """Safety Guardian agent: checks for safety issues and medical advice."""
    protocol_id = state["protocol_id"]
    
    # Initialize agent_notes if not present
    if "agent_notes" not in state:
        state["agent_notes"] = []
    
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
        llm = get_llm()
        response = llm.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON from response
        default_safety = {
            "score": 85 if "safe" in response_text.lower() else 60,
            "flags": ["Could not parse detailed safety assessment"],
            "notes": response_text[:500]
        }
        safety_data = parse_json_response(response_text, default_safety)
        
        state["safety_score"] = {
            "score": safety_data.get("score", 75),
            "flags": safety_data.get("flags", []),
            "notes": safety_data.get("notes", "Safety review completed")
        }
        
        # Write to scratchpad
        if state["safety_score"]["flags"]:
            for flag in state["safety_score"]["flags"]:
                state["agent_notes"].append({
                    "role": "safety_guardian",
                    "content": f"Safety flag: {flag}",
                    "timestamp": datetime.utcnow().isoformat()
                })
        
        # Add summary note to scratchpad
        state["agent_notes"].append({
            "role": "safety_guardian",
            "content": f"Safety review complete. Score: {state['safety_score']['score']}/100. {len(state['safety_score']['flags'])} flag(s) raised.",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Update protocol in database
        protocol = db.query(Protocol).filter(Protocol.id == protocol_id).first()
        if protocol:
            protocol.safety_score = state["safety_score"]
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
        # Write error to scratchpad
        state["agent_notes"].append({
            "role": "safety_guardian",
            "content": f"Error during safety review: {str(e)}",
            "timestamp": datetime.utcnow().isoformat()
        })
    
    state["last_agent"] = "safety_guardian"
    state["next_agent"] = "supervisor"
    return state

