import pytest
from unittest.mock import MagicMock, patch
from app.retriever import HybridRetriever

@patch('app.retriever.EmbeddingClient')
def test_hybrid_retriever_rrf(mock_embedding_class):
    # Mock embedding client
    mock_emb = MagicMock()
    mock_emb.embed_text.return_value = [0.1] * 384
    mock_embedding_class.return_value = mock_emb

    retriever = HybridRetriever()
    
    # Mock db session
    mock_db = MagicMock()
    
    # Mock vector results (chunk 1 similarity 0.9, chunk 2 similarity 0.8)
    # Mock fts results (chunk 2 rank 1.5, chunk 3 rank 0.5)
    # So chunk 2 is in both, chunk 1 is in vector, chunk 3 is in FTS
    
    mock_db.execute.side_effect = [
        # First call: Vector search
        MagicMock(fetchall=lambda: [(1, 0.9), (2, 0.8)]),
        # Second call: FTS search
        MagicMock(fetchall=lambda: [(2, 1.5), (3, 0.5)])
    ]
    
    # Mock document and chunks query mapping
    mock_chunk_1 = MagicMock(id=1, document_id=10, content="Content 1", page_number=1, section_heading="S1", bbox=None, chunk_type="text")
    mock_chunk_1.document.name = "doc1.pdf"
    
    mock_chunk_2 = MagicMock(id=2, document_id=10, content="Content 2", page_number=2, section_heading="S2", bbox=None, chunk_type="text")
    mock_chunk_2.document.name = "doc1.pdf"
    
    mock_chunk_3 = MagicMock(id=3, document_id=10, content="Content 3", page_number=3, section_heading="S3", bbox=None, chunk_type="text")
    mock_chunk_3.document.name = "doc1.pdf"
    
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [
        mock_chunk_1, mock_chunk_2, mock_chunk_3
    ]
    
    results = retriever.retrieve(db=mock_db, query="test query", limit=3)
    
    # Check that results are returned
    assert len(results) > 0
    # Chunk 2 should be ranked 1st since it appeared in both (highest RRF score)
    assert results[0]["id"] == 2
