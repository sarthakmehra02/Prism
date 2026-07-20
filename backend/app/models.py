from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.db import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    file_path = Column(String, nullable=False)
    status = Column(String, default="processing", nullable=False)  # 'processing', 'completed', 'failed'
    user_uid = Column(String, nullable=True, index=True)  # Firebase User UID
    session_id = Column(String, nullable=True, index=True)  # Chat session ID (Phase 13)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=False)
    section_heading = Column(String, nullable=True)
    bbox = Column(JSON, nullable=True)  # List of coordinates: [x1, y1, x2, y2]
    chunk_type = Column(String, nullable=False)  # 'text', 'table', 'figure'
    embedding = Column(Vector(384), nullable=True)  # 384 dimensions for all-MiniLM-L6-v2
    meta = Column(JSON, nullable=True)  # Store table structures, raw Docling items, etc.

    document = relationship("Document", back_populates="chunks")


class SharedSession(Base):
    __tablename__ = "shared_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    messages = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatSession(Base):
    """Named, persistent chat session owned by a Firebase user."""
    __tablename__ = "chat_sessions"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_uid   = Column(String, nullable=False, index=True)
    title      = Column(String, nullable=False, default="New Chat")
    messages   = Column(JSON, nullable=False, default=list)
    doc_ids    = Column(JSON, nullable=False, default=list)   # selected document IDs
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

