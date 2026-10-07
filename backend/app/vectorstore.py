"""
ChromaDB client — local persistent vector store replacing pgvector.
Collection name: 'prism_chunks'
Each document is stored with metadata so we can filter by user_uid / document_id.
"""
import os
import logging
from typing import List, Dict, Any, Optional

from app.config import settings

logger = logging.getLogger("prism.vectorstore")

CHROMA_PATH = settings.chroma_store_path
os.makedirs(CHROMA_PATH, exist_ok=True)

_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is None:
        import chromadb
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = _client.get_or_create_collection(
            name="prism_chunks",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(f"ChromaDB collection 'prism_chunks' ready at {CHROMA_PATH}")
    return _collection


def add_chunks(
    chroma_ids: List[str],
    embeddings: List[List[float]],
    documents: List[str],
    metadatas: List[Dict[str, Any]],
):
    """Upsert chunks into ChromaDB."""
    col = _get_collection()
    col.upsert(
        ids=chroma_ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
    )


def query_chunks(
    query_embedding: List[float],
    n_results: int = 20,
    where: Optional[Dict] = None,
) -> List[Dict[str, Any]]:
    """Return top-n results from ChromaDB for a given query embedding."""
    col = _get_collection()
    kwargs: Dict[str, Any] = {
        "query_embeddings": [query_embedding],
        "n_results": n_results,
        "include": ["distances", "metadatas", "documents"],
    }
    if where:
        kwargs["where"] = where
    results = col.query(**kwargs)
    output = []
    if results and results.get("ids"):
        ids = results["ids"][0]
        distances = results["distances"][0]
        metadatas = results["metadatas"][0]
        for chroma_id, dist, meta in zip(ids, distances, metadatas):
            output.append({
                "chroma_id": chroma_id,
                "similarity": 1.0 - dist,  # cosine distance → similarity
                "meta": meta,
            })
    return output


def delete_chunks_by_document(document_id: int):
    """Remove all ChromaDB entries for a given document_id."""
    col = _get_collection()
    col.delete(where={"document_id": document_id})
