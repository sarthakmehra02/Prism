import os
import shutil
import logging
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db, init_db
from app.models import Document, DocumentChunk, ChatSession
from app.parser import DocumentParser
from app.embeddings import EmbeddingClient
from app.retriever import HybridRetriever
from app.generator import AnswerGenerator
from app.auth import get_current_user
import firebase_admin

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("prism.main")

app = FastAPI(title="Prism API", description="Multimodal Document Intelligence Platform")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://prism-nu-seven.vercel.app",
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_origin_regex=r"https?://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Run database schema migration on startup
@app.on_event("startup")
def startup_event():
    logger.info("Starting up Prism API...")
    init_db()

@app.get("/")
def read_root():
    return {"status": "online", "message": "Welcome to Prism Multimodal Document Intelligence Platform"}

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    firebase_active = bool(firebase_admin._apps)
    db_ok = False
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.error(f"Health check DB failed: {e}")
        
    return {
        "status": "healthy" if (firebase_active and db_ok) else "degraded",
        "firebase_active": firebase_active,
        "database_connected": db_ok,
        "service_account_env_present": bool(os.environ.get("SERVICE_ACCOUNT_JSON")),
        "database_url_present": bool(os.environ.get("DATABASE_URL"))
    }

# Schema definitions
class QueryRequest(BaseModel):
    query: str
    document_ids: Optional[List[int]] = None
    limit: Optional[int] = 5
    history: Optional[List[dict]] = None
    session_id: Optional[str] = None

class QueryResponse(BaseModel):
    answer: str
    has_citations: bool
    warning: Optional[str] = None
    citations: List[dict]

# Background task for parsing and indexing
def process_document_task(document_id: int, file_path: str):
    logger.info(f"Background task started for document ID {document_id}")
    
    # We open a new database session inside the thread/task
    from app.db import SessionLocal
    db = SessionLocal()
    
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        logger.error(f"Document with ID {document_id} not found.")
        db.close()
        return

    try:
        # Define progress callback
        def update_progress(status_str: str):
            try:
                progress_db = SessionLocal()
                d = progress_db.query(Document).filter(Document.id == document_id).first()
                if d:
                    d.status = status_str
                    progress_db.commit()
            except Exception as pe:
                logger.error(f"Failed to update progress: {pe}")
            finally:
                progress_db.close()

        # 1. Parse PDF layout and structure
        parser = DocumentParser()
        chunks_data = parser.parse_pdf(file_path, progress_callback=update_progress)
        
        if not chunks_data:
            logger.warning(f"No chunks extracted from document: {doc.name}")
            doc.status = "completed"
            db.commit()
            db.close()
            return
            
        # 2. Batch embed chunk contents
        logger.info(f"Embedding {len(chunks_data)} chunks...")
        update_progress("processing:Generating vector embeddings...")
        embedding_client = EmbeddingClient()
        contents = [c["content"] for c in chunks_data]
        embeddings = embedding_client.embed_texts(contents)
        
        # 3. Create Chunk models and save
        db_chunks = []
        for chunk_data, emb in zip(chunks_data, embeddings):
            db_chunk = DocumentChunk(
                document_id=document_id,
                content=chunk_data["content"],
                page_number=chunk_data["page_number"],
                section_heading=chunk_data["section_heading"],
                bbox=chunk_data["bbox"],
                chunk_type=chunk_data["chunk_type"],
                embedding=emb,
                meta=chunk_data["meta"]
            )
            db_chunks.append(db_chunk)
            
        db.add_all(db_chunks)
        doc.status = "completed"
        db.commit()
        logger.info(f"Ingestion successful for document: {doc.name}. Chunks added: {len(db_chunks)}")

    except Exception as e:
        logger.error(f"Ingestion failed for document {doc.name}: {e}", exc_info=True)
        doc.status = "failed"
        db.commit()
    finally:
        db.close()

@app.post("/api/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    safe_filename = os.path.basename(file.filename)
    if not safe_filename or not safe_filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    # Save the file to disk
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Fallback: if session_id is missing, assign to the user's most recent session
    if not session_id:
        latest_session = db.query(ChatSession).filter(
            ChatSession.user_uid == current_user["uid"]
        ).order_by(ChatSession.updated_at.desc()).first()
        if latest_session:
            session_id = latest_session.id
            logger.info(f"Fallback: mapped uploaded document to latest session={session_id}")
        else:
            logger.warning("Upload failed: No session exists for user.")
            raise HTTPException(status_code=400, detail="Cannot upload document. Please create a chat session first.")

    # Create DB record
    doc = Document(
        name=file.filename,
        file_path=file_path,
        status="processing",
        user_uid=current_user["uid"],
        session_id=session_id  # scope to this chat session
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Kick off background task
    background_tasks.add_task(process_document_task, doc.id, file_path)
    
    return {
        "id": doc.id,
        "name": doc.name,
        "status": doc.status,
        "message": "Upload complete. Parsing and indexing started in the background."
    }

@app.get("/api/documents")
def list_documents(
    session_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    logger.info(f"list_documents received session_id={session_id}")
    if not session_id:
        latest_session = db.query(ChatSession).filter(
            ChatSession.user_uid == current_user["uid"]
        ).order_by(ChatSession.updated_at.desc()).first()
        if latest_session:
            session_id = latest_session.id
            logger.info(f"Fallback: list_documents mapped null session to latest session={session_id}")
        else:
            return []

    docs = db.query(Document).filter(
        Document.session_id == session_id,
        (Document.user_uid == current_user["uid"]) | (Document.user_uid == None)
    ).order_by(Document.uploaded_at.desc()).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "status": d.status,
            "uploaded_at": d.uploaded_at,
            "chunk_count": db.query(DocumentChunk).filter(DocumentChunk.document_id == d.id).count()
        }
        for d in docs
    ]

@app.delete("/api/documents/{document_id}")
def delete_document(
    document_id: int, 
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    doc = db.query(Document).filter(
        Document.id == document_id,
        (Document.user_uid == current_user["uid"]) | (Document.user_uid == None)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
        
    # Delete file on disk
    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception as e:
            logger.error(f"Error removing file {doc.file_path}: {e}")
            
    db.delete(doc)
    db.commit()
    return {"message": f"Document {document_id} and its associated chunks deleted successfully"}

from fastapi.responses import FileResponse

@app.get("/api/documents/{document_id}/file")
def get_document_file(
    document_id: int, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    doc = db.query(Document).filter(
        Document.id == document_id,
        (Document.user_uid == current_user["uid"]) | (Document.user_uid == None)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        doc.file_path,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=\"{doc.name}\""}
    )

@app.post("/api/query", response_model=QueryResponse)
def query_prism(
    request: QueryRequest, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # If no explicit document selection is provided, limit to all documents in this session
    effective_doc_ids = request.document_ids
    if not effective_doc_ids and request.session_id:
        session_docs = db.query(Document).filter(
            Document.session_id == request.session_id,
            (Document.user_uid == current_user["uid"]) | (Document.user_uid == None)
        ).all()
        effective_doc_ids = [d.id for d in session_docs]
        if not effective_doc_ids:
            effective_doc_ids = [-1]  # Force empty retrieval

    # 1. Retrieve relevant chunks using Hybrid search + RRF
    retriever = HybridRetriever()
    retrieved_chunks = retriever.retrieve(
        db=db,
        query=request.query,
        user_uid=current_user["uid"],
        document_ids=effective_doc_ids,
        limit=request.limit or 5
    )
    
    # 2. Call Nvidia NIM generator to synthesize grounded answer
    generator = AnswerGenerator()
    generation_result = generator.generate_answer(
        query=request.query,
        chunks=retrieved_chunks,
        history=request.history
    )
    
    return generation_result


# ─────────────────── Phase 9: Rename & Reprocess ────────────────────

class RenameRequest(BaseModel):
    name: str

@app.patch("/api/documents/{document_id}")
def rename_document(
    document_id: int,
    body: RenameRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Rename a document (display name only; file on disk is not moved)."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        (Document.user_uid == current_user["uid"]) | (Document.user_uid == None)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    doc.name = new_name
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "name": doc.name, "status": doc.status}


@app.post("/api/documents/{document_id}/reprocess")
def reprocess_document(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete existing chunks and re-parse/re-embed the document."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        (Document.user_uid == current_user["uid"]) | (Document.user_uid == None)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Original file not found on disk; cannot reprocess")

    # Wipe old chunks
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
    doc.status = "processing"
    db.commit()

    # Re-trigger background parsing + embedding
    background_tasks.add_task(process_document_task, doc.id, doc.file_path)
    return {"id": doc.id, "name": doc.name, "status": doc.status, "message": "Reprocessing started."}


# ─────────────────── Phase 10: Chat Sharing ─────────────────────────

import uuid
from app.models import SharedSession

class ShareRequest(BaseModel):
    title: str
    messages: List[dict]

@app.post("/api/shared")
def create_shared_session(
    body: ShareRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Save a chat transcript as a public shareable session and return its UUID."""
    if not body.messages:
        raise HTTPException(status_code=400, detail="Messages array cannot be empty")
    session_id = str(uuid.uuid4())
    session = SharedSession(
        id=session_id,
        title=body.title or "Shared Prism Session",
        messages=body.messages
    )
    db.add(session)
    db.commit()
    return {"id": session_id}


@app.get("/api/shared/{session_id}")
def get_shared_session(session_id: str, db: Session = Depends(get_db)):
    """Return a public shareable session by UUID (no auth required)."""
    session = db.query(SharedSession).filter(SharedSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Shared session not found")
    return {
        "id": session.id,
        "title": session.title,
        "messages": session.messages,
        "created_at": session.created_at
    }


# ─────────────────── Phase 13: Multi-Chat Sessions ──────────────────

SESSION_LIMIT = 20  # max sessions per user

class SessionUpdateRequest(BaseModel):
    title: Optional[str] = None
    messages: List[dict]
    doc_ids: List[int] = []


@app.get("/api/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Return all chat sessions for the current user, newest first."""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_uid == current_user["uid"])
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s in sessions
    ]


@app.post("/api/sessions", status_code=201)
def create_session(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new empty chat session. Enforces SESSION_LIMIT per user."""
    count = db.query(ChatSession).filter(ChatSession.user_uid == current_user["uid"]).count()
    if count >= SESSION_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Session limit of {SESSION_LIMIT} reached. Delete an old session to create a new one."
        )
    session = ChatSession(
        user_uid=current_user["uid"],
        title="New Chat",
        messages=[],
        doc_ids=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title, "created_at": session.created_at, "updated_at": session.updated_at}


@app.get("/api/sessions/{session_id}")
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Load a session's full messages and document selection."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_uid == current_user["uid"]
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "title": session.title,
        "messages": session.messages,
        "doc_ids": session.doc_ids,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


@app.put("/api/sessions/{session_id}")
def update_session(
    session_id: str,
    body: SessionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Save messages + doc_ids; auto-set title from first user message."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_uid == current_user["uid"]
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.messages = body.messages
    session.doc_ids = body.doc_ids

    # Auto-title on first save if still default
    if body.title:
        session.title = body.title
    elif session.title == "New Chat" and body.messages:
        first_user = next((m["content"] for m in body.messages if m.get("role") == "user"), None)
        if first_user:
            session.title = first_user[:45] + ("..." if len(first_user) > 45 else "")

    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title, "updated_at": session.updated_at}


@app.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Permanently delete a chat session."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_uid == current_user["uid"]
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return None
