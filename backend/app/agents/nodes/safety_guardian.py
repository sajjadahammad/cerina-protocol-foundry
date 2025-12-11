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

Provide your assessment in JSON format ONLY. Return ONLY the JSON object with this exact structure:

{{
    "score": 85,
    "flags": ["flag1", "flag2"],
    "notes": "A plain text summary of your safety assessment. Keep it concise but informative."
}}

SCORING GUIDELINES:
- Score 90-100: No significant safety concerns, protocol is safe for clinical use
- Score 80-89: Minor safety concerns that should be noted but don't prevent use
- Score 70-79: Moderate safety concerns that require attention
- Score 60-69: Significant safety concerns that need revision
- Score 50-59: Major safety concerns, protocol needs substantial revision
- Score 0-49: Critical safety issues, protocol is unsafe

IMPORTANT:
- The score MUST correlate with the number and severity of flags
- More flags = lower score (e.g., 5+ flags should result in score < 80)
- Critical safety issues (self-harm, medical advice) should result in score < 70
- "score" must be an integer between 0-100
- "flags" must be an array of strings (e.g., ["concern1", "concern2"])
- "notes" must be a plain text string, NOT a nested object or array
- Do NOT include any explanation outside the JSON
- Do NOT use nested structures in the "notes" field

Be thorough but fair. Only flag genuine safety concerns. Return ONLY valid JSON."""
    
    try:
        llm = get_llm()
        response = llm.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Parse JSON from response
        default_safety = {
            "score": 75,  # Neutral default, not 85
            "flags": ["Could not parse detailed safety assessment"],
            "notes": response_text[:500]
        }
        safety_data = parse_json_response(response_text, default_safety)
        
        # Ensure score is a valid integer between 0-100
        parsed_score = safety_data.get("score", 75)
        if isinstance(parsed_score, str):
            # Try to extract number from string
            import re
            numbers = re.findall(r'\d+', str(parsed_score))
            parsed_score = int(numbers[0]) if numbers else 75
        parsed_score = max(0, min(100, int(parsed_score)))  # Clamp to 0-100
        
        # Normalize flags - ensure it's a list of strings and make them human-readable
        flags = safety_data.get("flags", [])
        if isinstance(flags, str):
            flags = [flags]
        elif not isinstance(flags, list):
            flags = []
        flags = [str(f) if not isinstance(f, str) else f for f in flags]
        
        # Convert flags to human-readable format (remove underscores, capitalize)
        def format_flag(flag: str) -> str:
            """Convert flag from snake_case to Title Case."""
            # Replace underscores with spaces
            formatted = flag.replace("_", " ")
            # Capitalize each word
            words = formatted.split()
            formatted = " ".join(word.capitalize() for word in words)
            return formatted
        
        flags = [format_flag(flag) for flag in flags]
        
        # Normalize notes - must be a string, not a dict
        notes = safety_data.get("notes", "Safety review completed")
        if isinstance(notes, dict):
            # If notes is a dict, convert it to a readable string
            import json
            notes = json.dumps(notes, indent=2)
        elif not isinstance(notes, str):
            notes = str(notes) if notes else "Safety review completed"
        
        # Limit notes length to prevent database issues
        if len(notes) > 5000:
            notes = notes[:5000] + "... (truncated)"
        
        # Safety check: Automatically adjust score based on number of flags
        # If there are many flags, the score should be lower
        flag_count = len(flags)
        if flag_count >= 5:
            # 5+ flags = significant concerns, cap score at 75
            parsed_score = min(parsed_score, 75)
        elif flag_count >= 3:
            # 3-4 flags = moderate concerns, cap score at 80
            parsed_score = min(parsed_score, 80)
        elif flag_count >= 1:
            # 1-2 flags = minor concerns, cap score at 90
            parsed_score = min(parsed_score, 90)
        
        # Check for critical flags that should lower the score
        critical_keywords = ["self-harm", "suicide", "dangerous", "medical advice", "licensure", "unsafe"]
        has_critical = any(keyword.lower() in flag.lower() for flag in flags for keyword in critical_keywords)
        if has_critical and parsed_score > 70:
            # Critical safety issues should result in score <= 70
            parsed_score = min(parsed_score, 70)
        
        state["safety_score"] = {
            "score": parsed_score,
            "flags": flags,
            "notes": notes
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
    # Don't set next_agent - we return to supervisor via direct edge, supervisor will set next_agent
    return state

