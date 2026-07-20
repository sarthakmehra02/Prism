import os
import re
import logging
import base64
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("prism.parser")

class DocumentParser:
    def __init__(self):
        self.converter = None
        self.openai_client = None
        self.vision_model = settings.NVIDIA_VISION_MODEL

    def _get_converter(self):
        if self.converter is None:
            logger.info("Lazy-loading Docling DocumentConverter...")
            from docling.datamodel.pipeline_options import PdfPipelineOptions
            from docling.document_converter import DocumentConverter, PdfFormatOption
            
            pipeline_options = PdfPipelineOptions()
            pipeline_options.do_ocr = True
            pipeline_options.do_table_structure = True
            
            self.converter = DocumentConverter(
                format_options={
                    "pdf": PdfFormatOption(pipeline_options=pipeline_options)
                }
            )
        return self.converter

    def _get_openai_client(self):
        if self.openai_client is None:
            from openai import OpenAI
            self.openai_client = OpenAI(
                base_url=settings.NVIDIA_BASE_URL,
                api_key=settings.NVIDIA_API_KEY
            )
        return self.openai_client

    def _describe_figure(self, fitz_doc, page_number: int, bbox: List[float], caption: Optional[str]) -> str:
        if not fitz_doc or not bbox:
            return caption or f"Figure on page {page_number}"
        
        try:
            # page_number in docling is 1-indexed, fitz is 0-indexed
            import fitz
            page = fitz_doc.load_page(page_number - 1)
            page_height = page.rect.height
            
            l, t, r, b = bbox
            x0 = l
            y0 = min(page_height - t, page_height - b)
            x1 = r
            y1 = max(page_height - t, page_height - b)
            
            rect = fitz.Rect(x0, y0, x1, y1)
            if rect.is_empty:
                return caption or f"Figure on page {page_number}"
                
            # Get cropped image as PNG bytes
            pix = page.get_pixmap(clip=rect)
            png_bytes = pix.tobytes("png")
            base64_img = base64.b64encode(png_bytes).decode("utf-8")
            
            prompt = (
                "You are an expert document analyzer. Describe this figure/chart/image from the document in detail. "
                "Extract any text labels, headers, data points, chart trends, axes, legends, tables, and visual layout. "
                "Provide a comprehensive, search-friendly textual representation of the figure so a text-based search engine can retrieve it."
            )
            if caption:
                prompt += f"\n\nContext / Caption of this figure: {caption}"
                
            logger.info(f"Calling vision model {self.vision_model} to describe figure on page {page_number}...")
            client = self._get_openai_client()
            response = client.chat.completions.create(
                model=self.vision_model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_img}"}}
                        ]
                    }
                ],
                max_tokens=512
            )
            
            description = response.choices[0].message.content.strip()
            logger.info(f"Successfully generated vision description for figure on page {page_number} ({len(description)} chars).")
            return f"{caption or 'Figure'}: {description}"
            
        except Exception as e:
            logger.error(f"Failed to generate vision description for figure on page {page_number}: {e}")
            return caption or f"Figure on page {page_number}"

    def split_into_sentences(self, text: str) -> List[str]:
        """Splits text into sentences using regex, avoiding splitting abbreviations."""
        sentence_end = re.compile(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s')
        sentences = sentence_end.split(text)
        return [s.strip() for s in sentences if s.strip()]

    def chunk_text(self, text: str, max_chars: int = 1000, overlap_chars: int = 200) -> List[str]:
        """Chunks a single block of text respecting sentence boundaries."""
        sentences = self.split_into_sentences(text)
        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_len = len(sentence)
            if current_length + sentence_len > max_chars and current_chunk:
                chunks.append(" ".join(current_chunk))
                # Create overlap: keep last few sentences that fit in overlap
                overlap_chunk = []
                overlap_len = 0
                for s in reversed(current_chunk):
                    if overlap_len + len(s) < overlap_chars:
                        overlap_chunk.insert(0, s)
                        overlap_len += len(s) + 1
                    else:
                        break
                current_chunk = overlap_chunk
                current_length = overlap_len
            
            current_chunk.append(sentence)
            current_length += sentence_len + 1  # plus space

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    def parse_pdf(self, file_path: str, progress_callback: Optional[Any] = None) -> List[Dict[str, Any]]:
        """Parses a PDF using Docling and returns a list of chunks with metadata."""
        logger.info(f"Starting Docling parse for file: {file_path}")
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Open PDF with PyMuPDF to extract figure images if they exist
        fitz_doc = None
        try:
            import fitz
            fitz_doc = fitz.open(file_path)
        except Exception as fe:
            logger.warning(f"Could not open PDF with PyMuPDF for figure extraction: {fe}")
            
        try:
            if progress_callback:
                progress_callback("processing:Converting document layout...")
            converter = self._get_converter()
            result = converter.convert(file_path)
            doc = result.document
            
            if progress_callback:
                progress_callback("processing:Analyzing document structure...")
            
            chunks = []
            current_section = "Document Header"
            
            # Pre-scan to count total figures
            items = list(doc.iterate_items())
            total_figures = 0
            for item, level in items:
                item_type = type(item).__name__
                label = getattr(item, "label", "").lower()
                if "picture" in label or "figure" in label or item_type == "PictureItem":
                    total_figures += 1

            fig_idx = 0
            
            # Iterate through the structured layout elements of the document
            for item, level in items:
                item_type = type(item).__name__
                label = getattr(item, "label", "").lower()
                
                # Update current section heading if we encounter a header
                if "header" in label or "title" in label or "heading" in label or item_type == "SectionHeaderItem":
                    current_section = item.text.strip() if item.text else current_section
                    continue

                # Extract page number and bounding box coordinates if available
                page_number = 1
                bbox = None
                if hasattr(item, "prov") and item.prov:
                    prov = item.prov[0]
                    page_number = getattr(prov, "page_no", 1)
                    bbox_obj = getattr(prov, "bbox", None)
                    if bbox_obj:
                        l = getattr(bbox_obj, "l", 0.0)
                        t = getattr(bbox_obj, "t", 0.0)
                        r = getattr(bbox_obj, "r", 0.0)
                        b = getattr(bbox_obj, "b", 0.0)
                        bbox = [l, t, r, b]

                # Process Tables
                if "table" in label or item_type == "TableItem":
                    table_content = ""
                    # Try exporting table to markdown format
                    if hasattr(item, "export_to_markdown"):
                        try:
                            table_content = item.export_to_markdown(doc=doc)
                        except Exception:
                            try:
                                table_content = item.export_to_markdown()
                            except Exception:
                                pass
                    
                    if not table_content and hasattr(item, "export_to_dataframe"):
                        try:
                            df = item.export_to_dataframe(doc=doc)
                            table_content = df.to_markdown()
                        except Exception:
                            try:
                                df = item.export_to_dataframe()
                                table_content = df.to_markdown()
                            except Exception:
                                pass
                    
                    if not table_content:
                        table_content = getattr(item, "text", None) or ""

                    if table_content.strip():
                        chunks.append({
                            "content": table_content,
                            "page_number": page_number,
                            "section_heading": current_section,
                            "bbox": bbox,
                            "chunk_type": "table",
                            "meta": {"raw_table": True}
                        })
                
                # Process Figures/Pictures
                elif "picture" in label or "figure" in label or item_type == "PictureItem":
                    # Register the figure chunk - we will use the bounding box for vision crops in Phase 2
                    figure_caption = None
                    if hasattr(item, "caption_text"):
                        try:
                            figure_caption = item.caption_text(doc=doc)
                        except Exception:
                            pass
                    
                    if not figure_caption:
                        figure_caption = getattr(item, "text", None)
                    
                    if not figure_caption:
                        figure_caption = f"Figure on page {page_number}"

                    fig_idx += 1
                    if progress_callback:
                        progress_callback(f"processing:Describing figure {fig_idx} of {total_figures}...")

                    # Generate vision description
                    figure_description = self._describe_figure(fitz_doc, page_number, bbox, figure_caption)

                    chunks.append({
                        "content": figure_description,
                        "page_number": page_number,
                        "section_heading": current_section,
                        "bbox": bbox,
                        "chunk_type": "figure",
                        "meta": {"figure_bbox": bbox}
                    })

                # Process Standard Text
                else:
                    text_content = item.text.strip() if item.text else ""
                    if not text_content:
                        continue

                    # If text block is too long, chunk it without breaking sentences
                    if len(text_content) > 1000:
                        sub_chunks = self.chunk_text(text_content)
                        for sc in sub_chunks:
                            chunks.append({
                                "content": sc,
                                "page_number": page_number,
                                "section_heading": current_section,
                                "bbox": bbox,
                                "chunk_type": "text",
                                "meta": {}
                            })
                    else:
                        chunks.append({
                            "content": text_content,
                            "page_number": page_number,
                            "section_heading": current_section,
                            "bbox": bbox,
                            "chunk_type": "text",
                            "meta": {}
                        })
            
            logger.info(f"Parsing complete. Extracted {len(chunks)} chunks.")
            return chunks

        except Exception as e:
            logger.error(f"Failed to parse PDF {file_path}: {e}", exc_info=True)
            raise e
        finally:
            if fitz_doc:
                try:
                    fitz_doc.close()
                except Exception:
                    pass
