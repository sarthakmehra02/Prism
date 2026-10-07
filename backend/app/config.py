import os
from pydantic_settings import BaseSettings

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Settings(BaseSettings):
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_MODEL: str = "meta/llama-3.2-11b-vision-instruct"
    NVIDIA_VISION_MODEL: str = "meta/llama-3.2-11b-vision-instruct"

    # Optional database URL (if using remote Postgres/Supabase)
    DATABASE_URL: str = ""

    # Storage directory: if DATA_DIR is set (e.g. /data on a persistent volume), all state lives there
    DATA_DIR: str = os.getenv("DATA_DIR", "")

    # Local cache paths for fastembed ONNX model download
    FASTEMBED_CACHE: str = os.getenv("FASTEMBED_CACHE", os.path.join(os.path.expanduser("~"), ".cache", "fastembed"))

    @property
    def sqlite_db_path(self) -> str:
        target_dir = self.DATA_DIR if self.DATA_DIR else BASE_DIR
        return os.path.join(target_dir, "prism_local.db")

    @property
    def chroma_store_path(self) -> str:
        target_dir = self.DATA_DIR if self.DATA_DIR else BASE_DIR
        return os.path.join(target_dir, "chroma_store")

    @property
    def uploads_path(self) -> str:
        target_dir = self.DATA_DIR if self.DATA_DIR else BASE_DIR
        return os.path.join(target_dir, "uploads")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

