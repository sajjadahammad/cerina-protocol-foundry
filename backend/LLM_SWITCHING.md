# LLM Provider Switching Guide

This project supports switching between different LLM providers. Currently configured to use **Qwen 2.5 Pro via Hugging Face** by default.

## Current Configuration (Qwen 2.5 Pro)

The system is currently using **Qwen 2.5 Pro** via Hugging Face Inference API.

### Environment Variables Required:
```bash
LLM_PROVIDER=huggingface
HUGGINGFACE_API_KEY=your_huggingface_api_key_here
HUGGINGFACE_MODEL=Qwen/Qwen2.5-72B-Instruct
```

### Installation:
```bash
pip install langchain-community langchain-huggingface huggingface-hub
```

## Switching Back to Mistral

To switch back to Mistral AI:

1. **Set environment variable:**
   ```bash
   LLM_PROVIDER=mistral
   MISTRAL_API_KEY=your_mistral_api_key_here
   MISTRAL_MODEL=mistral-large-latest
   ```

2. **Uncomment Mistral code:**
   - In `backend/app/agents/nodes.py`: Uncomment the Mistral import and `get_mistral_llm()` function
   - In `backend/app/config.py`: Mistral settings are already there
   - In `backend/app/main.py`: Uncomment the Mistral health check code
   - In `backend/app/api/routes.py`: Uncomment the Mistral API key check

3. **Install Mistral dependencies:**
   ```bash
   pip install langchain-mistralai mistralai
   ```

4. **Update `get_llm()` function** in `backend/app/agents/nodes.py` to include:
   ```python
   elif provider == "mistral":
       return get_mistral_llm()
   ```

## Why Qwen 2.5 Pro?

- **Faster inference** - Optimized for speed
- **Better performance** - Strong reasoning capabilities
- **Cost-effective** - Hugging Face Inference API pricing
- **Open source** - More transparent and customizable

## Performance Comparison

- **Mistral**: ~2-5 seconds per request
- **Qwen 2.5 Pro**: ~1-3 seconds per request (typically faster)

