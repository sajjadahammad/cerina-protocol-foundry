"""JSON parsing utilities."""
import json
from typing import Dict, Any


def parse_json_response(response_text: str, default: Dict[str, Any] = None) -> Dict[str, Any]:
    """Parse JSON from LLM response, handling markdown code blocks.
    
    Args:
        response_text: The raw response text from LLM
        default: Default dict to return if parsing fails
        
    Returns:
        Parsed JSON as dictionary
    """
    if default is None:
        default = {}
    
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
        
        return json.loads(response_text)
    except (json.JSONDecodeError, ValueError):
        return default

