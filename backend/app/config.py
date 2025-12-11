"""Application configuration and settings."""
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API Configuration
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    
    # Database
    DATABASE_URL: str = "sqlite:///./cerina_foundry.db"
    
    # LLM Provider Selection
    LLM_PROVIDER: str = "huggingface"  # "huggingface" or "mistral"
    
    # Mistral AI (commented out - can switch back by setting LLM_PROVIDER=mistral)
    MISTRAL_API_KEY: Optional[str] = None
    MISTRAL_MODEL: str = "mistral-large-latest"
    
    # Hugging Face (Qwen 2.5 Pro)
    HUGGINGFACE_API_KEY: Optional[str] = None
    HUGGINGFACE_MODEL: str = "Qwen/Qwen2.5-72B-Instruct"
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]
    
    # MCP Server
    MCP_SERVER_NAME: str = "cerina-foundry"
    MCP_SERVER_VERSION: str = "1.0.0"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"  # Ignore extra environment variables
        # Ensure we read from environment variables
        env_prefix = ""  # No prefix needed


settings = Settings()

