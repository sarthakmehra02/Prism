"""
Document parser — uses PyMuPDF (fitz) for layout extraction.

Replaces the previous Docling-based parser to reduce memory footprint from
~1.2 GB to ~30 MB, making the backend compatible with free-tier hosting.

Features preserved:
  - Text extraction with per-page structure
  - Heading detection and section tracking
  - Table extraction (text-level, markdown-formatted)
  - Figure detection and NVIDIA vision description
  - Sentence-boundary chunking with overlap
"""
import os
import re
import logging
import base64
from typing import List, Dict, Any, Optional

from app.config import settings

logger = logging.getLogger("prism.parser")


class DocumentParser:
    def __init__(self):
        self.openai_client = None
        self.vision_model = settings.NVIDIA_VISION_MODEL

    # ──────────────────────────── OpenAI / NVIDIA client ────────────────────

    def _get_openai_client(self):
        if self.openai_client is None:
            from openai import OpenAI
            self.openai_client = OpenAI(
                base_url=settings.NVIDIA_BASE_URL,
                api_key=settings.NVIDIA_API_KEY,
            )
        return self.openai_client

    # ──────────────────────────── Vision description ─────────────────────────

    def _describe_figure(
        self,
        page,           # fitz.Page
        clip_rect,      # fitz.Rect or None (crop area for the figure)
        caption: Optional[str],
        page_number: int,
    ) -> str:
        """Crop a region from the page and send it to the NVIDIA vision model."""
        try:
            import fitz  # PyMuPDF
            if clip_rect and not clip_rect.is_empty and clip_rect.width > 10 and clip_rect.height > 10:
                pad = 6.0
                rect = fitz.Rect(
                    max(0.0, clip_rect.x0 - pad),
                    max(0.0, clip_rect.y0 - pad),
                    min(page.rect.width, clip_rect.x1 + pad),
                    min(page.rect.height, clip_rect.y1 + pad),
                )
                pix = page.get_pixmap(clip=rect)
            else:
                pix = page.get_pixmap()

            base64_img = base64.b64encode(pix.tobytes("png")).decode("utf-8")

            prompt = (
                "You are an expert document visual intelligence analyzer. "
                "Analyze and describe this figure/chart/diagram/image from the document in thorough detail.\n"
                "1. Extract all text, numbers, metrics, labels, axes, legends, column/row titles, and exact numerical data points.\n"
                "2. If it is a chart or diagram, explain its structure, all values, and key takeaways.\n"
                "3. Provide a clear, structured textual summary that enables accurate question answering and semantic search."
            )
            if caption:
                prompt += f"\n\nContext / Caption of this figure: {caption}"

            model_to_use = self.vision_model or "meta/llama-3.2-11b-vision-instruct"
            logger.info(f"Calling vision model {model_to_use} for figure on page {page_number}...")
            client = self._get_openai_client()
            response = client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_img}"}},
                        ],
                    }
                ],
                max_tokens=1024,
            )
            description = (response.choices[0].message.content or "").strip()
            logger.info(f"Vision description generated: {len(description)} chars")
            return f"{caption or 'Figure'}: {description}"
        except Exception as e:
            logger.error(f"Vision description failed for page {page_number}: {e}")
            return caption or f"Figure on page {page_number}"

    # ──────────────────────────── Text utilities ──────────────────────────────

    def split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences on .!? boundaries, respecting abbreviations."""
        sentence_end = re.compile(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s')
        return [s.strip() for s in sentence_end.split(text) if s.strip()]

    def chunk_text(self, text: str, max_chars: int = 1000, overlap_chars: int = 200) -> List[str]:
        """Chunk a long text block on sentence boundaries with overlap."""
        sentences = self.split_into_sentences(text)
        chunks: List[str] = []
        current: List[str] = []
        current_len = 0

        for sentence in sentences:
            slen = len(sentence)
            if current_len + slen > max_chars and current:
                chunks.append(" ".join(current))
                # overlap: keep last few sentences
                overlap: List[str] = []
                olen = 0
                for s in reversed(current):
                    if olen + len(s) < overlap_chars:
                        overlap.insert(0, s)
                        olen += len(s) + 1
                    else:
                        break
                current = overlap
                current_len = olen
            current.append(sentence)
            current_len += slen + 1

        if current:
            chunks.append(" ".join(current))
        return chunks

    # ──────────────────────────── Heading heuristics ─────────────────────────

    @staticmethod
    def _is_heading(span_text: str, flags: int, font_size: float, page_max_font: float) -> bool:
        """
        Heuristic: a span is a heading if it is bold/italic AND
        larger than the page's median body text size by at least 10%.
        """
        is_bold_or_italic = bool(flags & 0b10010)  # bit 1 = italic, bit 4 = bold
        is_large = font_size >= page_max_font * 1.1
        short = len(span_text.strip()) < 120
        return is_bold_or_italic and is_large and short

    # ──────────────────────────── Main parse entry ────────────────────────────

    def parse_pdf(
        self,
        file_path: str,
        progress_callback=None,
    ) -> List[Dict[str, Any]]:
        """
        Parse a PDF with PyMuPDF and return a list of chunk dicts compatible
        with the DocumentChunk schema.
        """
        logger.info(f"Starting PyMuPDF parse for: {file_path}")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        import fitz  # PyMuPDF

        doc = fitz.open(file_path)
        chunks: List[Dict[str, Any]] = []
        current_section = "Document"

        total_pages = doc.page_count

        for page_idx in range(total_pages):
            page = doc.load_page(page_idx)
            page_number = page_idx + 1  # 1-indexed

            if progress_callback:
                progress_callback(f"processing:Reading page {page_number} of {total_pages}...")

            # ── Determine typical (body) font size on this page ──────────────
            all_sizes: List[float] = []
            page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:   # 0 = text block
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if span.get("text", "").strip():
                            all_sizes.append(span.get("size", 12.0))

            if not all_sizes:
                body_size = 12.0
            else:
                all_sizes.sort()
                body_size = all_sizes[len(all_sizes) // 2]  # median

            # ── Walk blocks ──────────────────────────────────────────────────
            for block in page_dict.get("blocks", []):
                btype = block.get("type")

                # ── IMAGE block → vision description ────────────────────────
                if btype == 1:
                    if progress_callback:
                        progress_callback(f"processing:Describing figure on page {page_number}...")
                    bbox_list = list(block.get("bbox", []))
                    clip = fitz.Rect(bbox_list) if bbox_list else None
                    description = self._describe_figure(page, clip, None, page_number)
                    chunks.append({
                        "content": description,
                        "page_number": page_number,
                        "section_heading": current_section,
                        "bbox": bbox_list,
                        "chunk_type": "figure",
                        "meta": {},
                    })
                    continue

                # ── TEXT block ───────────────────────────────────────────────
                if btype != 0:
                    continue

                block_lines: List[str] = []
                block_is_heading = False
                bbox_list = list(block.get("bbox", []))

                for line in block.get("lines", []):
                    line_text_parts: List[str] = []
                    for span in line.get("spans", []):
                        span_text = span.get("text", "").strip()
                        if not span_text:
                            continue
                        flags = span.get("flags", 0)
                        size = span.get("size", 12.0)
                        line_text_parts.append(span_text)
                        if self._is_heading(span_text, flags, size, body_size):
                            block_is_heading = True

                    if line_text_parts:
                        block_lines.append(" ".join(line_text_parts))

                full_text = " ".join(block_lines).strip()
                if not full_text:
                    continue

                # ── Heading → update current section ────────────────────────
                if block_is_heading and len(full_text) < 200:
                    current_section = full_text
                    continue

                # ── Long text → chunk it ─────────────────────────────────────
                if len(full_text) > 1000:
                    sub_chunks = self.chunk_text(full_text)
                    for sc in sub_chunks:
                        chunks.append({
                            "content": sc,
                            "page_number": page_number,
                            "section_heading": current_section,
                            "bbox": bbox_list,
                            "chunk_type": "text",
                            "meta": {},
                        })
                else:
                    chunks.append({
                        "content": full_text,
                        "page_number": page_number,
                        "section_heading": current_section,
                        "bbox": bbox_list,
                        "chunk_type": "text",
                        "meta": {},
                    })

            # ── TABLE detection via PyMuPDF find_tables() ───────────────────
            try:
                tables = page.find_tables()
                for table in tables.tables:
                    try:
                        df = table.to_pandas()
                        table_md = df.to_markdown(index=False)
                        if table_md and table_md.strip():
                            bbox_list = list(table.bbox)
                            chunks.append({
                                "content": table_md,
                                "page_number": page_number,
                                "section_heading": current_section,
                                "bbox": bbox_list,
                                "chunk_type": "table",
                                "meta": {"raw_table": True},
                            })
                    except Exception as te:
                        logger.debug(f"Table markdown export failed on page {page_number}: {te}")
            except Exception as tfe:
                logger.debug(f"Table detection unavailable on page {page_number}: {tfe}")

        doc.close()
        logger.info(f"PyMuPDF parse complete. Extracted {len(chunks)} chunks from {total_pages} pages.")
        return chunks
