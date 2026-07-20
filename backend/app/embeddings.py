import logging
from typing import List
from app.config import settings

logger = logging.getLogger("prism.embeddings")

class EmbeddingClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingClient, cls).__new__(cls)
            cls._instance.model = None
            cls._instance.use_api = False
            
            if settings.NVIDIA_API_KEY and settings.NVIDIA_API_KEY.startswith("nvapi-"):
                try:
                    from openai import OpenAI
                    cls._instance.openai_client = OpenAI(
                        base_url=settings.NVIDIA_BASE_URL,
                        api_key=settings.NVIDIA_API_KEY
                    )
                    cls._instance.use_api = True
                    logger.info("Using NVIDIA NIM API for text embeddings (0MB RAM footprint).")
                except Exception as e:
                    logger.warning(f"Failed to setup API embeddings, fallback to local: {e}")
        return cls._instance

    def _get_local_model(self):
        if self.model is None:
            logger.info("Lazy-loading local SentenceTransformer model: all-MiniLM-L6-v2...")
            from sentence_transformers import SentenceTransformer
            import torch
            torch.set_num_threads(1)
            self.model = SentenceTransformer("all-MiniLM-L6-v2", cache_folder=settings.HF_HOME)
        return self.model

    def embed_text(self, text: str) -> List[float]:
        res = self.embed_texts([text])
        return res[0] if res else []

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
            
        if self.use_api:
            try:
                # Truncate texts if too long
                clean_texts = [t[:2000] for t in texts]
                response = self.openai_client.embeddings.create(
                    input=clean_texts,
                    model="nvidia/nv-embedqa-e5-v5",
                    encoding_format="float"
                )
                return [data.embedding for data in response.data]
            except Exception as e:
                logger.error(f"NVIDIA API embedding failed, falling back to local model: {e}")

        # Fallback to lazy local model
        model = self._get_local_model()
        embeddings = model.encode(texts)
        return embeddings.tolist()
