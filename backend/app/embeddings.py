"""
Embedding client — uses fastembed (ONNX) instead of sentence-transformers+PyTorch.

fastembed runs all-MiniLM-L6-v2 via ONNX Runtime, producing the same 384-dim vectors
as before but using ~150 MB RAM instead of ~900 MB. Compatible with the existing
ChromaDB collection (same model, same dimensions).
"""
import logging
from typing import List, Optional, Any

logger = logging.getLogger("prism.embeddings")


class EmbeddingClient:
    _instance: Optional["EmbeddingClient"] = None
    _model: Any = None

    def __new__(cls) -> "EmbeddingClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = None
            logger.info("EmbeddingClient initialised (fastembed / all-MiniLM-L6-v2, 384-dim ONNX).")
        return cls._instance

    def _get_model(self) -> Any:
        if self._model is None:
            logger.info("Lazy-loading fastembed TextEmbedding model: all-MiniLM-L6-v2 ...")
            from fastembed import TextEmbedding
            self._model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
            logger.info("fastembed model loaded successfully.")
        return self._model

    def embed_text(self, text: str) -> List[float]:
        results = self.embed_texts([text])
        return results[0] if results else []

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        model = self._get_model()
        embeddings = list(model.embed(texts))
        return [emb.tolist() for emb in embeddings]
