"""LLM provider utilities."""
from app.config import settings

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


def get_llm():
    """Get the configured LLM instance based on LLM_PROVIDER setting."""
    provider = settings.LLM_PROVIDER.lower()
    
    if provider == "huggingface":
        return get_huggingface_llm()
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}. Use 'huggingface' or 'mistral'")

