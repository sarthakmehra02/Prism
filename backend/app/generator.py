import re
import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI
from app.config import settings

logger = logging.getLogger("prism.generator")

class AnswerGenerator:
    def __init__(self):
        self.client = OpenAI(
            base_url=settings.NVIDIA_BASE_URL,
            api_key=settings.NVIDIA_API_KEY
        )
        self.model = settings.NVIDIA_MODEL

    def _format_context(self, chunks: List[Dict[str, Any]]) -> str:
        context_blocks = []
        for i, chunk in enumerate(chunks, 1):
            doc_name = chunk["document_name"]
            page = chunk["page_number"]
            sec = chunk["section_heading"] or "General"
            content = chunk["content"]
            header = f"--- CONTEXT BLOCK {i} | Source: {doc_name} | Page: {page} | Section: {sec} ---"
            context_blocks.append(f"{header}\n{content}\n")
        return "\n".join(context_blocks)

    def generate_answer(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        if not chunks:
            return {
                "answer": "No relevant context was found to answer this question.",
                "has_citations": False,
                "warning": "No documents retrieved for this query.",
                "citations": []
            }

        context_str = self._format_context(chunks)

        system_prompt = (
            "You are Prism, an advanced Multimodal Document Intelligence platform.\n"
            "Your task is to answer the user question using ONLY the provided contexts.\n\n"
            "RULES:\n"
            "1. Answer naturally in clean prose.\n"
            "2. Do NOT include inline citations, reference numbers, or bracketed source links in your response. The system handles citations separately.\n"
            "3. If the contexts do not contain enough information, say so clearly. Do not make up facts.\n"
            "4. When answering follow-up questions, you may refer to your previous answers in this conversation.\n"
        )

        messages = [{"role": "system", "content": system_prompt}]

        if history:
            for turn in history[-12:]:
                role = turn.get("role", "user")
                content = turn.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})

        user_prompt = f"Contexts:\n{context_str}\n\nQuestion: {query}\n\nAnswer:"
        messages.append({"role": "user", "content": user_prompt})

        logger.info(f"Calling {self.model} (history turns: {len(history) if history else 0})")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
                max_tokens=1024
            )

            answer = response.choices[0].message.content.strip()
            answer = re.sub(r'\s*\[[^\]]*(?:\.[Pp][Dd][Ff]|[Pp]age|[Pp]g\.?)\s*\d*[^\]]*\]', '', answer)
            answer = re.sub(r'\s*\[\s*\]', '', answer)
            answer = re.sub(r'[ \t]+', ' ', answer).strip()

            citations = []
            seen = set()
            for chunk in chunks:
                key = f"{chunk['document_name']}_page_{chunk['page_number']}"
                if key not in seen:
                    seen.add(key)
                    citations.append({
                        "document_id": chunk["document_id"],
                        "document_name": chunk["document_name"],
                        "page_number": chunk["page_number"],
                        "section_heading": chunk["section_heading"],
                        "bbox": chunk["bbox"],
                        "chunk_type": chunk["chunk_type"]
                    })

            logger.info(f"Answer generation completed. Citations: {len(citations)}")
            return {
                "answer": answer,
                "has_citations": True,
                "warning": None,
                "citations": citations
            }

        except Exception as e:
            logger.error(f"NVIDIA NIM API call failed: {e}", exc_info=True)
            return {
                "answer": "An error occurred while generating the answer. Please check the backend logs.",
                "has_citations": False,
                "warning": f"LLM API failure: {str(e)}",
                "citations": []
            }
