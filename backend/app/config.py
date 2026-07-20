from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field(..., env="DATABASE_URL")
    NVIDIA_API_KEY: str = Field(..., env="NVIDIA_API_KEY")
    NVIDIA_BASE_URL: str = Field("https://integrate.api.nvidia.com/v1", env="NVIDIA_BASE_URL")
    NVIDIA_MODEL: str = Field("meta/llama-3.3-70b-instruct", env="NVIDIA_MODEL")
    NVIDIA_VISION_MODEL: str = Field("meta/llama-3.2-11b-vision-instruct", env="NVIDIA_VISION_MODEL")
    
    # Caches
    HF_HOME: str = Field("/cache/huggingface", env="HF_HOME")
    DOCLING_MODELS_CACHE: str = Field("/cache/docling", env="DOCLING_MODELS_CACHE")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
