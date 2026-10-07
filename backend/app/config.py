import os
from pydantic_settings import BaseSettings

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Settings(BaseSettings):
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_MODEL: str = "meta/llama-3.2-11b-vision-instruct"
    NVIDIA_VISION_MODEL: str = "meta/llama-3.2-11b-vision-instruct"

    @property
    def clean_nvidia_api_key(self) -> str:
        return (self.NVIDIA_API_KEY or "").strip().strip("'\"")

    @property
    def clean_nvidia_base_url(self) -> str:
        raw = (self.NVIDIA_BASE_URL or "https://integrate.api.nvidia.com/v1").strip().strip("'\"").rstrip("/")
        if not raw:
            return "https://integrate.api.nvidia.com/v1"
        if raw.startswith("http://"):
            raw = "https://" + raw[7:]
        if "api.nvidia.com" in raw and "integrate." not in raw:
            raw = raw.replace("api.nvidia.com", "integrate.api.nvidia.com")
        if not raw.endswith("/v1"):
            raw = f"{raw}/v1"
        return raw

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

