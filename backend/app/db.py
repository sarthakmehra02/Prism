from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings
import logging

logger = logging.getLogger("prism.db")

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initializes the database, creating the pgvector extension and all tables."""
    try:
        # Create vector extension
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            logger.info("pgvector extension verified/created.")
            
        # Create tables
        import app.models
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully.")
        
        # Add user_uid column if it does not exist (migration) and full-text search index
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_uid VARCHAR;"))
            logger.info("Checked/Added user_uid column to documents table.")

            conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id VARCHAR;"))
            logger.info("Checked/Added session_id column to documents table.")
            
            # Check if index exists or create it
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS chunk_fts_idx ON document_chunks 
                USING gin(to_tsvector('english', content));
            """))
            logger.info("Full-text search index verified/created.")
            
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise e
