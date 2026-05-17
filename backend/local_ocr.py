"""
Lokalni OCR z EasyOCR — natančne bounding boxe.
Uporablja se za PRECIZNE pozicije; Vision LLM ostaja za razumevanje vsebine.
"""

import io
import fitz
import numpy as np
from PIL import Image


_reader = None


def get_reader():
    """Singleton — modeli se nalozijo samo enkrat."""
    global _reader
    if _reader is None:
        print("  → Inicializiram EasyOCR (slovenščina + angleščina)...")
        import easyocr
        _reader = easyocr.Reader(['sl', 'en'], gpu=False, verbose=False)
        print("  → EasyOCR pripravljen")
    return _reader


def extract_boxes_only(pdf_path: str, dpi: int = 200) -> dict:
    """
    Vrne natančne bounding boxe za vsako besedo v PDF-ju.

    Returns:
        {page_num: [{text, x, y, w, h, confidence}, ...]}
        Koordinate v pikslih pri DPI.
    """
    reader = get_reader()
    doc = fitz.open(pdf_path)
    blocks_per_page = {}

    for page_num, page in enumerate(doc):
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))

        # EasyOCR vrne: [(bbox, text, confidence), ...]
        # bbox = 4 točke [[x1,y1], [x2,y1], [x2,y2], [x1,y2]]
        results = reader.readtext(np.array(img))

        blocks = []
        for (bbox, text, confidence) in results:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]

            blocks.append({
                'text': text,
                'x': float(min(xs)),
                'y': float(min(ys)),
                'w': float(max(xs) - min(xs)),
                'h': float(max(ys) - min(ys)),
                'confidence': float(confidence),
            })

        blocks_per_page[page_num] = blocks
        avg_conf = np.mean([b['confidence'] for b in blocks]) if blocks else 0
        print(f"  → EasyOCR stran {page_num + 1}: {len(blocks)} blokov (avg conf: {avg_conf:.2f})")

    doc.close()
    return blocks_per_page