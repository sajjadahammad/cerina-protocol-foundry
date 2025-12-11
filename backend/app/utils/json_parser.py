"""JSON parsing utilities."""
import json
import sys
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
        # First, try to find JSON object in the response
        # Look for JSON wrapped in markdown code blocks
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            if json_end > json_start:
                response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            if json_end > json_start:
                response_text = response_text[json_start:json_end].strip()
        
        # Try to find JSON object boundaries if not in code block
        if "{" in response_text and "}" in response_text:
            start_idx = response_text.find("{")
            # Find matching closing brace
            brace_count = 0
            end_idx = start_idx
            for i in range(start_idx, len(response_text)):
                if response_text[i] == "{":
                    brace_count += 1
                elif response_text[i] == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            if end_idx > start_idx:
                response_text = response_text[start_idx:end_idx]
        
        # Clean up any trailing commas or invalid JSON
        response_text = response_text.strip()
        
        # Remove any trailing commas before closing braces/brackets
        import re
        response_text = re.sub(r',\s*}', '}', response_text)
        response_text = re.sub(r',\s*]', ']', response_text)
        
        return json.loads(response_text)
    except (json.JSONDecodeError, ValueError) as e:
        # Log the actual response for debugging
        sys.stderr.write(f"JSON parsing failed. Response preview: {response_text[:500]}\n")
        sys.stderr.write(f"JSON parse error: {str(e)}\n")
        return default

