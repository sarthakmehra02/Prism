"""
Hybrid Retriever — ChromaDB (vector) + BM25 (full-text) with Reciprocal Rank Fusion.
Replaces the PostgreSQL pgvector + ts_rank implementation.
"""
import logging
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session

from app.embeddings import EmbeddingClient
from app.models import DocumentChunk, Document
from app import vectorstore

logger = logging.getLogger("prism.retriever")


def _bm25_search(
    chunks: List[DocumentChunk],
    query: str,
    limit: int,
) -> List[tuple[int, float]]:
    """Run BM25 over the given chunks and return (chunk_id, score) pairs."""
    try:
        from rank_bm25 import BM25Okapi
    except ImportError:
        logger.warning("rank_bm25 not installed — skipping BM25 search")
        return []

    if not chunks:
        return []

    tokenised = [c.content.lower().split() for c in chunks]
    bm25 = BM25Okapi(tokenised)
    scores = bm25.get_scores(query.lower().split())

    results = sorted(
        [(chunks[i].id, float(scores[i])) for i in range(len(chunks)) if scores[i] > 0],
        key=lambda x: x[1],
        reverse=True,
    )
    return results[:limit]


class HybridRetriever:
    def __init__(self):
        self.embedding_client = EmbeddingClient()

    def retrieve(
        self,
        db: Session,
        query: str,
        user_uid: str,
        document_ids: Optional[List[int]] = None,
        limit: int = 5,
        k: float = 60.0,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search: ChromaDB vector similarity + BM25 full-text,
        merged with Reciprocal Rank Fusion (RRF).
        """
        logger.info(
            f"Retrieving for query='{query}' user_uid={user_uid} "
            f"doc_ids={document_ids} limit={limit}"
        )

        has_doc_filter = bool(document_ids)
        fetch_limit = max(limit * 3, (len(document_ids) * 4) if has_doc_filter else 0)

        # ── 1. Vector search via ChromaDB ────────────────────────────────
        vector_results: List[tuple[int, float]] = []
        try:
            query_vector = self.embedding_client.embed_text(query)
            where: Optional[Dict] = None
            if has_doc_filter:
                if len(document_ids) == 1:
                    where = {"document_id": document_ids[0]}
                else:
                    where = {"document_id": {"$in": document_ids}}

            chroma_hits = vectorstore.query_chunks(
                query_embedding=query_vector,
                n_results=max(fetch_limit, 20),
                where=where,
            )
            # Map chroma_id → sqlite chunk id via metadata
            for hit in chroma_hits:
                chunk_id = hit["meta"].get("chunk_id")
                if chunk_id is not None:
                    vector_results.append((int(chunk_id), hit["similarity"]))
        except Exception as e:
            logger.error(f"Vector search failed: {e}", exc_info=True)

        # ── 2. BM25 full-text search (in-memory) ────────────────────────
        bm25_results: List[tuple[int, float]] = []
        try:
            q = db.query(DocumentChunk).join(Document).filter(
                (Document.user_uid == user_uid) | (Document.user_uid == None)
            )
            if has_doc_filter:
                q = q.filter(DocumentChunk.document_id.in_(document_ids))
            candidate_chunks = q.all()
            bm25_results = _bm25_search(candidate_chunks, query, limit=fetch_limit)
        except Exception as e:
            logger.error(f"BM25 search failed: {e}", exc_info=True)

        # ── 3. Reciprocal Rank Fusion ────────────────────────────────────
        rrf_scores: Dict[int, float] = {}
        for rank, (chunk_id, _) in enumerate(vector_results, start=1):
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
        for rank, (chunk_id, _) in enumerate(bm25_results, start=1):
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (k + rank)

        effective_limit = max(limit, len(document_ids) * 3) if has_doc_filter else limit
        sorted_ids = sorted(rrf_scores, key=lambda cid: rrf_scores[cid], reverse=True)[:effective_limit]

        if not sorted_ids:
            logger.info("No chunks matched the query.")
            return []

        # ── 4. Fetch full chunk rows ─────────────────────────────────────
        chunks_query = (
            db.query(DocumentChunk)
            .join(Document)
            .filter(
                DocumentChunk.id.in_(sorted_ids),
                (Document.user_uid == user_uid) | (Document.user_uid == None),
            )
            .all()
        )
        chunks_map = {c.id: c for c in chunks_query}

        retrieved = []
        for cid in sorted_ids:
            chunk = chunks_map.get(cid)
            if chunk:
                retrieved.append({
                    "id": chunk.id,
                    "document_id": chunk.document_id,
                    "document_name": chunk.document.name,
                    "content": chunk.content,
                    "page_number": chunk.page_number,
                    "section_heading": chunk.section_heading,
                    "bbox": chunk.bbox,
                    "chunk_type": chunk.chunk_type,
                    "rrf_score": rrf_scores[cid],
                })

        logger.info(f"Retrieved {len(retrieved)} chunks.")
        return retrieved
