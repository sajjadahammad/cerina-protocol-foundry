"""LLM provider utilities."""
from app.config import settings

# Optional imports for LLM providers
# These are imported conditionally because they're optional dependencies
# Users may only have one provider installed, so we handle ImportError gracefully

# Hugging Face imports
ChatHuggingFace = None
HuggingFaceEndpoint = None
USE_NEW_HUGGINGFACE = False

try:
    # Try new langchain_huggingface package first
    from langchain_huggingface import ChatHuggingFace
    from langchain_huggingface.llms import HuggingFaceEndpoint
    USE_NEW_HUGGINGFACE = True
except ImportError:
    try:
        # Fallback to langchain_community
        from langchain_community.llms import HuggingFaceEndpoint
        from langchain_community.chat_models import ChatHuggingFace
    except ImportError:
        # Neither package available - will raise error when used
        pass

# Mistral AI imports
ChatMistralAI = None

try:
    # Try langchain_mistralai package first
    from langchain_mistralai import ChatMistralAI
except ImportError:
    try:
        # Fallback to langchain_community
        from langchain_community.chat_models import ChatMistralAI
    except ImportError:
        # Neither package available - will raise error when used
        pass


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
        # Note: Can't use endpoint_url with repo_id - HuggingFaceEndpoint only accepts one
        # The repo_id will automatically use the Inference API endpoint
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


def get_mistral_llm():
    """Get configured Mistral AI LLM instance."""
    if not ChatMistralAI:
        raise ValueError(
            "langchain-mistralai not installed. Run: pip install langchain-mistralai mistralai"
        )
    
    if not settings.MISTRAL_API_KEY:
        raise ValueError("MISTRAL_API_KEY not configured")
    
    return ChatMistralAI(
        model=settings.MISTRAL_MODEL,
        mistral_api_key=settings.MISTRAL_API_KEY,
        temperature=0.7,
        max_tokens=4096,
    )


def get_llm():
    """Get the configured LLM instance based on LLM_PROVIDER setting.
    
    Automatically switches between Hugging Face and Mistral based on:
    - LLM_PROVIDER environment variable (defaults to "huggingface")
    - Available API keys
    
    To switch to Mistral:
    1. Set LLM_PROVIDER=mistral in your environment or .env file
    2. Set MISTRAL_API_KEY=your-mistral-api-key
    3. Install: pip install langchain-mistralai mistralai
    """
    provider = settings.LLM_PROVIDER.lower()
    
    if provider == "huggingface":
        return get_huggingface_llm()
    elif provider == "mistral":
        return get_mistral_llm()
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER: {provider}. "
            f"Use 'huggingface' or 'mistral'. "
            f"Current value: {settings.LLM_PROVIDER}"
        )

