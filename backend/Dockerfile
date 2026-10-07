FROM python:3.11-slim

# Install system dependencies needed by PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up work directory
WORKDIR /app

# Configure python path and caching
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV FASTEMBED_CACHE=/cache/fastembed
ENV DATA_DIR=/data

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code into container
COPY . /app

# Create cache, upload and data directories and set permissions for user 1000 (HF Spaces standard)
RUN useradd -m -u 1000 user && \
    mkdir -p /cache/fastembed /app/uploads /data && \
    chown -R user:user /cache /app /data && \
    chmod -R 777 /cache /app /data

USER user
ENV HOME=/home/user

# Expose default port (8000 for Render/local, override with PORT env var)
EXPOSE 8000

# Start FastAPI — reads PORT env var; defaults to 8000 (Render sets this automatically)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
