from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Text, Float
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.sql import func
from app.db import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    file_path = Column(String, nullable=False)
    status = Column(String, default="processing", nullable=False)  # 'processing', 'completed', 'failed'
    user_uid = Column(String, nullable=True, index=True)  # Firebase User UID
    session_id = Column(String, nullable=True, index=True)  # Chat session ID
    uploaded_at = Column(DateTime, server_default=func.now())

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=False)
    section_heading = Column(String, nullable=True)
    bbox = Column(JSON, nullable=True)
    chunk_type = Column(String, nullable=False)  # 'text', 'table', 'figure'
    # Embeddings stored in ChromaDB; this column tracks the chroma_id
    chroma_id = Column(String, nullable=True)
    meta = Column(JSON, nullable=True)

    document = relationship("Document", back_populates="chunks")


class SharedSession(Base):
    __tablename__ = "shared_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    messages = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class ChatSession(Base):
    """Named, persistent chat session owned by a Firebase user."""
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_uid = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False, default="New Chat")
    messages = Column(JSON, nullable=False, default=list)
    doc_ids = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
