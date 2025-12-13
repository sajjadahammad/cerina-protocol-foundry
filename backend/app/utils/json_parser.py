"""JSON parsing utilities."""
import json
import sys
from typing import Dict, Any


def parse_json_response(response_text: str, default: Dict[str, Any] = None) -> Dict[str, Any]:
    """Parse JSON from LLM response, handling markdown code blocks and truncated responses.
    
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
            # Find matching closing brace - handle truncated responses
            brace_count = 0
            end_idx = start_idx
            in_string = False
            escape_next = False
            
            for i in range(start_idx, len(response_text)):
                char = response_text[i]
                
                if escape_next:
                    escape_next = False
                    continue
                
                if char == '\\':
                    escape_next = True
                    continue
                
                if char == '"' and not escape_next:
                    in_string = not in_string
                    continue
                
                if not in_string:
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            end_idx = i + 1
                            break
            
            # If we didn't find a complete JSON object (truncated response), try to fix it
            if brace_count > 0:
                # Response was truncated - try to close it properly
                # Find the last complete field and close the object
                import re
                # Try to find the last complete key-value pair
                # Look for patterns like "key": value or "key": "value"
                last_comma = response_text.rfind(',', start_idx, end_idx if end_idx > start_idx else len(response_text))
                if last_comma > start_idx:
                    # Truncate at last comma and close the object
                    response_text = response_text[:last_comma] + "}"
                else:
                    # No comma found, try to close at a reasonable point
                    # Look for the last complete string value
                    last_quote = response_text.rfind('"', start_idx)
                    if last_quote > start_idx:
                        # Find the matching opening quote
                        quote_count = 0
                        for i in range(start_idx, last_quote):
                            if response_text[i] == '"' and (i == 0 or response_text[i-1] != '\\'):
                                quote_count += 1
                        if quote_count % 2 == 0:  # Even number of quotes = complete string
                            # Try to add closing brace after the last quote
                            response_text = response_text[:last_quote+1] + "}"
                    else:
                        # Fallback: just close the object
                        response_text = response_text[:end_idx if end_idx > start_idx else len(response_text)] + "}"
            elif end_idx > start_idx:
                response_text = response_text[start_idx:end_idx]
        
        # Clean up any trailing commas or invalid JSON
        response_text = response_text.strip()
        
        # Remove any trailing commas before closing braces/brackets
        import re
        response_text = re.sub(r',\s*}', '}', response_text)
        response_text = re.sub(r',\s*]', ']', response_text)
        
        # Fix any incomplete string values (common in truncated responses)
        # If we have an unclosed string, close it
        if response_text.count('"') % 2 != 0:
            # Odd number of quotes - string is not closed
            # Find the last quote and close the string
            last_quote = response_text.rfind('"')
            if last_quote > 0:
                # Check if it's an opening or closing quote by looking at context
                # If followed by : or , it's likely an opening quote
                if last_quote < len(response_text) - 1:
                    next_char = response_text[last_quote + 1]
                    if next_char in [':', ',']:
                        # This is an opening quote, need to close it
                        # Find where to insert closing quote (before next : or })
                        insert_pos = len(response_text)
                        for i in range(last_quote + 1, len(response_text)):
                            if response_text[i] in [':', ',', '}']:
                                insert_pos = i
                                break
                        response_text = response_text[:insert_pos] + '"' + response_text[insert_pos:]
        
        return json.loads(response_text)
    except (json.JSONDecodeError, ValueError) as e:
        # Log the actual response for debugging
        sys.stderr.write(f"JSON parsing failed. Response preview: {response_text[:1000]}\n")
        sys.stderr.write(f"JSON parse error: {str(e)}\n")
        
        # Try one more time with a more aggressive fix
        try:
            import re
            # Try to extract just the fields we need
            score_match = re.search(r'"score"\s*:\s*(\d+)', response_text)
            tone_match = re.search(r'"tone"\s*:\s*"([^"]*)', response_text)
            suggestions_match = re.search(r'"suggestions"\s*:\s*\[(.*?)\]', response_text, re.DOTALL)
            
            if score_match:
                score = int(score_match.group(1))
                tone = tone_match.group(1) if tone_match else "Appropriate"
                suggestions = []
                if suggestions_match:
                    # Try to parse suggestions array
                    suggestions_text = suggestions_match.group(1)
                    # Extract quoted strings
                    suggestion_matches = re.findall(r'"([^"]*)"', suggestions_text)
                    suggestions = suggestion_matches[:5]  # Limit to 5 suggestions
                
                return {
                    "score": score,
                    "tone": tone,
                    "suggestions": suggestions if suggestions else ["Could not parse full response"]
                }
        except Exception as e2:
            sys.stderr.write(f"Fallback parsing also failed: {str(e2)}\n")
        
        return default

