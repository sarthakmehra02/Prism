# 🌌 PRISM — Multimodal Document Intelligence Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/Postgres-pgvector-blue.svg?logo=postgresql)](https://www.postgresql.org/)

**PRISM** is a production-grade, AI-powered Full-Stack Multimodal Document RAG (Retrieval-Augmented Generation) platform. It parses complex PDFs, extracts structured tables, describes visual charts using vision models, and answers user queries with pixel-perfect page-level citations and an interactive document viewer.

---

## 🔗 Live Deployments

* **🖥️ Live Web App (Frontend)**: [prism-mehrasam825.vercel.app](https://prism-mehrasam825.vercel.app)
* **⚙️ Live Backend API**: [prism-backend-xvhd.onrender.com](https://prism-backend-xvhd.onrender.com)
* **💻 GitHub Repository**: [github.com/sarthakmehra02/Prism](https://github.com/sarthakmehra02/Prism)

---

## 🚀 Key Features

* **Multimodal Vision RAG**: Automatically crops charts/figures via PyMuPDF and generates descriptive summaries using **Llama 3.2 Vision** for vector indexing.
* **Layout-Aware PDF Ingestion**: Uses **Docling** to parse sections, lists, and tables directly into structured markdown chunks.
* **Hybrid Search (Vector + FTS + RRF)**: Combines semantic vector similarity (`all-MiniLM-L6-v2` embeddings via `pgvector`) with PostgreSQL Full-Text Search, fused together using **Reciprocal Rank Fusion (RRF)**.
* **Interactive Citations**: Under-response citation badges map directly to the source PDF pages. Clicking a badge loads the document at the exact cited page.
* **ChatGPT-Style Workspaces**: Seamless multi-chat sessions with auto-titling, renaming, delete support, and workspace document isolation per session.
* **Secure User Access**: Isolated document workspaces using Firebase Auth validation on both frontend and backend.
* **Export & Sharing**: Export chat transcripts as formatted Markdown or PDF, and generate public, read-only session links.

---

## 🧱 Architecture Flowchart

```mermaid
flowchart TD
    A[User PDF Upload] --> B(Docling Layout Parser)
    B -->|Text & Tables| C(Sentence Splitter Chunks)
    B -->|Image/Figure Bboxes| D(PyMuPDF Crop B64)
    D --> E[Llama 3.2 Vision NIM]
    E -->|Text Descriptions| C
    C --> F(all-MiniLM-L6-v2 Embedder)
    F --> G[(Postgre SQL pgvector)]
    
    H[User Chat Query] --> I(Hybrid Retriever)
    I -->|Vector Search| G
    I -->|Full-Text Search| G
    I --> J(Reciprocal Rank Fusion)
    J --> K[Retrieve Context Chunks]
    K --> L[Llama 3.3 Instruct NIM]
    L --> M[Answer + Page-Level Citations]
```

---

## ⚙️ Environment Variables

Create a single `.env` file in your root workspace:

```env
# Database Credentials
DATABASE_URL=postgresql://postgres:pass@db:5432/postgres

# NVIDIA NIM API Keys
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
NVIDIA_VISION_MODEL=meta/llama-3.2-11b-vision-instruct

# Firebase Client configuration (Frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com

# Firebase Admin configuration (Backend)
SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

---

## 📦 Getting Started (Docker Compose)

Launch the entire stack (Postgres database, FastAPI backend, Next.js frontend, and Nginx proxy) with one command:

```bash
docker-compose up --build
```

Once loaded, access the platform locally at:
* **Web Workspace**: [http://localhost](http://localhost) (Nginx port 80 proxy)
* **Backend Docs / API Sandbox**: [http://localhost/api/docs](http://localhost/api/docs)
* **Health API Check**: [http://localhost/api/health](http://localhost/api/health)

---

## 🧪 Running Tests

To run the Pytest suite for parser, chunking, and RRF correctness:

```bash
docker-compose exec backend pytest
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
