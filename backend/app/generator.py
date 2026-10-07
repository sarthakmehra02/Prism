import re
import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI
from app.config import settings

logger = logging.getLogger("prism.generator")


class AnswerGenerator:
    def __init__(self):
        self.api_key = settings.clean_nvidia_api_key
        self.base_url = settings.NVIDIA_BASE_URL
        self.model = settings.NVIDIA_MODEL or "meta/llama-3.2-11b-vision-instruct"
        self.client = None
        if self.api_key:
            self.client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=45.0,
            )

    def _format_context(self, chunks: List[Dict[str, Any]]) -> str:
        context_blocks = []
        for i, chunk in enumerate(chunks, 1):
            doc_name = chunk.get("document_name", "Document")
            page = chunk.get("page_number", 1)
            sec = chunk.get("section_heading") or "General"
            content = (chunk.get("content") or "").strip()
            header = f"--- CONTEXT BLOCK {i} | Source: {doc_name} | Page: {page} | Section: {sec} ---"
            context_blocks.append(f"{header}\n{content}\n")
        return "\n".join(context_blocks)

    def _build_citations(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        citations = []
        seen = set()
        for chunk in chunks:
            key = f"{chunk.get('document_name')}_page_{chunk.get('page_number')}"
            if key not in seen:
                seen.add(key)
                citations.append({
                    "document_id": chunk.get("document_id"),
                    "document_name": chunk.get("document_name"),
                    "page_number": chunk.get("page_number"),
                    "section_heading": chunk.get("section_heading"),
                    "bbox": chunk.get("bbox"),
                    "chunk_type": chunk.get("chunk_type", "text")
                })
        return citations

    def generate_answer(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        citations = self._build_citations(chunks)

        if not chunks:
            return {
                "answer": "I couldn't find any relevant context in your documents to answer this question.",
                "has_citations": False,
                "warning": "No document chunks matched your query.",
                "citations": []
            }

        # Check if API key is configured
        if not self.api_key or not self.client:
            logger.warning("NVIDIA_API_KEY is not configured. Falling back to extractive preview.")
            return self._build_fallback_response(
                query=query,
                chunks=chunks,
                citations=citations,
                warning="NVIDIA_API_KEY is not set on the server. Please add your NVIDIA_API_KEY in Render's environment variables to enable AI generation."
            )

        context_str = self._format_context(chunks)

        system_prompt = (
            "You are Prism, an advanced and precise Document Intelligence AI.\n"
            "Your objective is to answer the user's question directly, accurately, and thoroughly using ONLY the provided document context.\n\n"
            "Response Guidelines:\n"
            "- Synthesize and present information using clean, structured Markdown (use bullet points, bold key facts, and tables where appropriate).\n"
            "- Answer directly without conversational preamble like 'Based on the provided documents' or 'According to the context'.\n"
            "- If the question asks for a summary, provide a clear executive summary capturing all critical terms, numbers, dates, and action items.\n"
            "- If the context does not contain enough information to answer the question, state clearly and concisely what is missing. Never fabricate facts or make assumptions beyond the text.\n"
            "- Do NOT include bracketed citation tags (e.g., [Page 1], [doc.pdf]) in your response; citations and source highlights are handled automatically by the UI.\n"
            "- When answering follow-up questions, maintain consistency with the ongoing conversation history."
        )

        messages: List[Any] = [{"role": "system", "content": system_prompt}]

        if history:
            for turn in history[-10:]:
                role = turn.get("role", "user")
                content = turn.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})

        user_prompt = f"Document Context:\n{context_str}\n\nUser Question: {query}\n\nAnswer:"
        messages.append({"role": "user", "content": user_prompt})

        logger.info(f"Calling NVIDIA NIM {self.model} (chunks: {len(chunks)}, history: {len(history) if history else 0})")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.2,
                max_tokens=1024
            )

            raw_answer = response.choices[0].message.content or ""
            answer = raw_answer.strip()

            # Clean up thinking tags or leftover artifacts
            answer = re.sub(r'<think>.*?</think>', '', answer, flags=re.DOTALL).strip()
            answer = re.sub(r'\s*\[[^\]]*(?:\.[Pp][Dd][Ff]|[Pp]age|[Pp]g\.?)\s*\d*[^\]]*\]', '', answer)
            answer = re.sub(r'\s*\[\s*\]', '', answer)
            answer = re.sub(r'[ \t]+', ' ', answer).strip()

            return {
                "answer": answer,
                "has_citations": True,
                "warning": None,
                "citations": citations
            }

        except Exception as e:
            logger.error(f"NVIDIA NIM API call failed: {e}", exc_info=True)
            return self._build_fallback_response(
                query=query,
                chunks=chunks,
                citations=citations,
                warning=f"AI generation service error ({type(e).__name__}). Displaying direct document excerpts below."
            )

    def _build_fallback_response(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        citations: List[Dict[str, Any]],
        warning: str
    ) -> Dict[str, Any]:
        extracted_blocks = []
        doc_name = chunks[0].get("document_name", "Document")
        for chunk in chunks[:4]:
            content_text = chunk.get("content", "").strip()
            if content_text and content_text != "|":
                sec = chunk.get("section_heading") or "Document Extract"
                page = chunk.get("page_number", 1)
                extracted_blocks.append(f"**{sec}** *(Page {page})*:\n{content_text}")

        fallback_body = "\n\n".join(extracted_blocks) if extracted_blocks else "No readable text found in the retrieved sections."
        answer = f"### Relevant Document Matches from **{doc_name}**\n\n{fallback_body}"

        return {
            "answer": answer,
            "has_citations": True,
            "warning": warning,
            "citations": citations
        }
