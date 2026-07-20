import logging
from typing import List
from sentence_transformers import SentenceTransformer
from app.config import settings

logger = logging.getLogger("prism.embeddings")

class EmbeddingClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingClient, cls).__new__(cls)
            logger.info("Initializing local SentenceTransformer model: all-MiniLM-L6-v2")
            try:
                cls._instance.model = SentenceTransformer(
                    "all-MiniLM-L6-v2",
                    cache_folder=settings.HF_HOME
                )
                logger.info("SentenceTransformer model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load SentenceTransformer model: {e}", exc_info=True)
                raise e
        return cls._instance

    def embed_text(self, text: str) -> List[float]:
        """Embeds a single string and returns a list of floats."""
        try:
            embedding = self.model.encode(text)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Failed to embed text: {e}")
            raise e

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Embeds a list of strings and returns a list of lists of floats."""
        try:
            embeddings = self.model.encode(texts)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Failed to embed text batch: {e}")
            raise e
