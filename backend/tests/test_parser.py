import pytest
from app.parser import DocumentParser

def test_split_into_sentences():
    parser = DocumentParser()
    text = "Hello world. This is a test sentence! Is this another sentence? Yes, indeed. Dr. Smith is here."
    sentences = parser.split_into_sentences(text)
    
    assert len(sentences) == 5
    assert sentences[0] == "Hello world."
    assert sentences[1] == "This is a test sentence!"
    assert sentences[2] == "Is this another sentence?"
    assert sentences[3] == "Yes, indeed."
    assert sentences[4] == "Dr. Smith is here."

def test_chunk_text():
    parser = DocumentParser()
    text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence."
    
    # Test small chunking size
    chunks = parser.chunk_text(text, max_chars=40, overlap_chars=10)
    
    assert len(chunks) > 1
    for chunk in chunks:
        # Every chunk should be well-formed sentences
        assert chunk.endswith(".") or chunk.endswith("!") or chunk.endswith("?")
