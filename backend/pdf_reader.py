import hashlib
import fitz
from vision_ocr import ocr_pdf_with_vision_with_blocks, is_scanned_pdf


_ocr_cache = {}


def _file_hash(pdf_path: str) -> str:
    """SHA256 hash datoteke za cache key."""
    h = hashlib.sha256()
    with open(pdf_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _merge_text_with_fallback(vision_per_page: dict, easyocr_blocks: dict) -> str:
    """
    Sestavi tekst po straneh: Vision tekst kjer je uporaben, sicer EasyOCR
    tekst (za strani, kjer Vision vrne prazno). Tako noben dokument ne ostane
    brez teksta zaradi občasnega praznega Vision odgovora.
    """
    pages = sorted(set(vision_per_page) | set(easyocr_blocks))
    parts = []
    for p in pages:
        vt = (vision_per_page.get(p) or "").strip()
        if len(vt) >= 20:
            parts.append(f"--- Stran {p + 1} ---\n{vt}")
        else:
            eo = " ".join(b.get("text", "") for b in easyocr_blocks.get(p, []))
            tag = "EasyOCR fallback" if eo.strip() else "prazno"
            print(f"  → Stran {p + 1}: Vision prazen → {tag}")
            parts.append(f"--- Stran {p + 1} ({tag}) ---\n{eo}")
    return "\n\n".join(parts)


def extract_text(pdf_path: str) -> str:
    """
    - PyMuPDF za digitalne (hitro)
    - Hibrid Vision LLM + EasyOCR za skenirane
      • Vision LLM: kakovostna ekstrakcija vsebine
      • EasyOCR: natančne pozicije
    """
    # 1) Hitri poskus z PyMuPDF
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()

    # 2) Skeniran → hibridni OCR
    if is_scanned_pdf(pdf_path):
        file_hash = _file_hash(pdf_path)

        if file_hash in _ocr_cache:
            cached = _ocr_cache[file_hash]
            print(f"  → OCR iz cache-a (hash: {file_hash[:8]}...)")
            return cached["text"]

        # Vision LLM: vsebina (cloud) — čisti tekst po straneh
        print(f"  → Dokument izgleda skeniran, preklapljam na hibridni OCR...")
        _, vision_text_per_page = ocr_pdf_with_vision_with_blocks(pdf_path)

        # EasyOCR: natančne pozicije (lokalno)
        from local_ocr import extract_boxes_only
        print(f"  → EasyOCR za natančne koordinate...")
        easyocr_blocks = extract_boxes_only(pdf_path)
        total_blocks = sum(len(b) for b in easyocr_blocks.values())
        print(f"  → EasyOCR našel {total_blocks} blokov skupaj")

        # Fallback: kjer Vision vrne prazno stran, uporabi EasyOCR tekst
        text = _merge_text_with_fallback(vision_text_per_page, easyocr_blocks)
        print(f"  → Skupni tekst {len(text)} znakov (z EasyOCR fallback)")

        # Cache: tekst + pozicije (EasyOCR)
        _ocr_cache[file_hash] = {
            "text": text,
            "blocks": easyocr_blocks,
        }

    return text


def get_ocr_blocks(pdf_path: str):
    """Vrne EasyOCR bloke za PDF, če je bil OCR-jev. Sicer None."""
    try:
        file_hash = _file_hash(pdf_path)
        if file_hash in _ocr_cache:
            return _ocr_cache[file_hash].get("blocks")
    except Exception:
        pass
    return None