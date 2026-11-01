import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "CivicFix"
    API_PREFIX: str = "api"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "sqlite:///./civicfix.db"
    SECRET_KEY: str = "civicfix-insecure-development-secret-key-change-in-prod"
    SESSION_EXPIRE_HOURS: int = 24
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]
    UPLOAD_DIR: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../uploads")
    )
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    ALLOWED_UPLOAD_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".pdf", ".txt"]
    ALLOWED_UPLOAD_MIME_TYPES: List[str] = [
        "image/jpeg",
        "image/png",
        "application/pdf",
        "text/plain",
    ]

    # Gemma / AI settings
    AI_PROVIDER: str = "gemini"  # "gemini", "ollama", "fake", "disabled"
    AI_MODEL_NAME: str = "gemma-4-26b-a4b-it"
    GEMINI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    AI_TIMEOUT_SECONDS: float = 30.0
    AI_MAX_RETRIES: int = 1
    AI_DESCRIPTION_MAX_CHARS: int = 1500
    AI_RATE_LIMIT_PER_MINUTE: int = 20

    # Demo mode
    ENABLE_DEMO_IDENTITY: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Ensure uploads directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
