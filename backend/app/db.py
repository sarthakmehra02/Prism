import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings
import logging

logger = logging.getLogger("prism.db")

# Ensure target database directory exists
os.makedirs(os.path.dirname(settings.sqlite_db_path), exist_ok=True)
DATABASE_URL = f"sqlite:///{settings.sqlite_db_path}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initializes the SQLite database, creating all tables."""
    try:
        import app.models  # noqa: F401 – registers all ORM models
        Base.metadata.create_all(bind=engine)
        logger.info("SQLite database tables created/verified successfully.")

        # Migration: add chroma_id column if it doesn't exist (safe to run repeatedly)
        with engine.begin() as conn:
            existing = [
                row[1]
                for row in conn.execute(
                    text("PRAGMA table_info(document_chunks)")
                ).fetchall()
            ]
            if "chroma_id" not in existing:
                conn.execute(
                    text("ALTER TABLE document_chunks ADD COLUMN chroma_id VARCHAR")
                )
                logger.info("Migration: added chroma_id column to document_chunks.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
