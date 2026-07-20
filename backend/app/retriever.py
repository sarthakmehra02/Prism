import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.embeddings import EmbeddingClient
from app.models import DocumentChunk, Document

logger = logging.getLogger("prism.retriever")

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
        k: float = 60.0
    ) -> List[Dict[str, Any]]:
        """
        Performs hybrid search (vector similarity + Postgres full-text search)
        and merges results using Reciprocal Rank Fusion (RRF).
        Filters documents strictly owned by user_uid (or NULL user_uid).
        """
        logger.info(f"Retrieving for query: '{query}' (user_uid={user_uid}, filters: doc_ids={document_ids}, limit={limit})")
        
        # 1. Embed query for vector search
        try:
            query_vector = self.embedding_client.embed_text(query)
        except Exception as e:
            logger.error(f"Failed to embed query: {e}")
            query_vector = None

        has_doc_filter = document_ids is not None and len(document_ids) > 0
        doc_ids_list = document_ids if has_doc_filter else []

        vector_results = []
        if query_vector:
            # Query vector similarity (pgvector <=> cosine distance)
            vector_sql = text("""
                SELECT dc.id, 1 - (dc.embedding <=> CAST(:query_vector AS vector)) as similarity
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE (d.user_uid = :user_uid OR d.user_uid IS NULL)
                  AND (:has_doc_filter = FALSE OR dc.document_id = ANY(:doc_ids))
                ORDER BY dc.embedding <=> CAST(:query_vector AS vector)
                LIMIT :fetch_limit
            """)
            try:
                res = db.execute(vector_sql, {
                    "query_vector": str(query_vector),
                    "user_uid": user_uid,
                    "has_doc_filter": has_doc_filter,
                    "doc_ids": doc_ids_list,
                    "fetch_limit": limit * 3
                }).fetchall()
                vector_results = [(row[0], row[1]) for row in res]
            except Exception as e:
                logger.error(f"Vector search failed: {e}", exc_info=True)

        # 2. Query full-text search (Postgres websearch_to_tsquery)
        fts_results = []
        fts_sql = text("""
            SELECT dc.id, ts_rank_cd(to_tsvector('english', dc.content), websearch_to_tsquery('english', :query)) as rank
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            WHERE (d.user_uid = :user_uid OR d.user_uid IS NULL)
              AND (:has_doc_filter = FALSE OR dc.document_id = ANY(:doc_ids))
              AND websearch_to_tsquery('english', :query) @@ to_tsvector('english', dc.content)
            ORDER BY rank DESC
            LIMIT :fetch_limit
        """)
        try:
            res = db.execute(fts_sql, {
                "query": query,
                "user_uid": user_uid,
                "has_doc_filter": has_doc_filter,
                "doc_ids": doc_ids_list,
                "fetch_limit": limit * 3
            }).fetchall()
            fts_results = [(row[0], row[1]) for row in res]
        except Exception as e:
            logger.error(f"FTS search failed: {e}", exc_info=True)

        # 3. Reciprocal Rank Fusion (RRF)
        rrf_scores = {}
        
        # Rank vector results
        for rank, (chunk_id, _) in enumerate(vector_results, start=1):
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (k + rank)

        # Rank FTS results
        for rank, (chunk_id, _) in enumerate(fts_results, start=1):
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (k + rank)

        # Sort chunk IDs by combined RRF score descending
        sorted_chunk_ids = sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)[:limit]
        
        if not sorted_chunk_ids:
            logger.info("No chunks matched the query.")
            return []

        # 4. Fetch the full chunks with document metadata
        chunks_query = db.query(DocumentChunk).join(Document).filter(
            DocumentChunk.id.in_(sorted_chunk_ids),
            (Document.user_uid == user_uid) | (Document.user_uid == None)
        ).all()
        chunks_map = {chunk.id: chunk for chunk in chunks_query}

        # Keep the sorted order of chunks
        retrieved_chunks = []
        for cid in sorted_chunk_ids:
            chunk = chunks_map.get(cid)
            if chunk:
                retrieved_chunks.append({
                    "id": chunk.id,
                    "document_id": chunk.document_id,
                    "document_name": chunk.document.name,
                    "content": chunk.content,
                    "page_number": chunk.page_number,
                    "section_heading": chunk.section_heading,
                    "bbox": chunk.bbox,
                    "chunk_type": chunk.chunk_type,
                    "rrf_score": rrf_scores[cid]
                })

        logger.info(f"Retrieved {len(retrieved_chunks)} chunks.")
        return retrieved_chunks
