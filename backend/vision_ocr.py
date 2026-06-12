"""
Vision LLM OCR — uporabi gpt-4o (vision capability) za ekstrakcijo teksta
iz skeniranih PDF-jev IN ustvari synthetic text layer za "search_for" podporo.

Synthetic text layer:
- Po OCR-ju vbrizgamo nevidno tekstovno plast v PDF
- PyMuPDF lahko nato find_coordinates_and_confidence kot pri običajnih PDF-jih
- Barvni okvirčki v Human Review delajo tudi za skenirane dokumente
"""

import io
import json
import base64
import fitz
from llm_client import client


VISION_MODEL = "google/gemini-2.5-flash"


def render_page_to_base64(page, dpi: int = 200):
    """Pretvori PDF stran v base64 PNG sliko + vrne dimenzije."""
    pix = page.get_pixmap(dpi=dpi)
    img_bytes = pix.tobytes("png")
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    return img_b64, pix.width, pix.height


def extract_page_text(image_b64: str, model: str = VISION_MODEL) -> str:
    """
    Prebere ves tekst s slike strani kot navaden tekst (brez koordinat).
    Krajši odgovor kot blok-JSON → hitreje in zanesljiveje (manj praznih strani).
    Koordinate za highlighting pridejo iz EasyOCR, ne od tu.
    """
    prompt = (
        "Preberi VES tekst s te slike dokumenta in ga vrni kot navaden tekst. "
        "Ohrani vrstni red branja (od zgoraj navzdol), vse številke, šumnike, "
        "datume in zneske. Pri tabelah ohrani posamezne vrstice. "
        "Vrni SAMO prebrani tekst, brez svojih komentarjev ali razlag."
    )
    response = client.chat.completions.create(
        model=model,
        max_tokens=4000,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                ],
            }
        ],
    )
    return (response.choices[0].message.content or "").strip()


def extract_text_blocks_with_positions(
    image_b64: str,
    image_width: int,
    image_height: int,
    model: str = VISION_MODEL
) -> list:
    """
    Pošlje sliko strani v Vision LLM in dobi seznam tekstovnih blokov
    z lokacijami. Format: [{"text": "...", "x": ..., "y": ..., "w": ..., "h": ...}].
    """
    prompt = f"""Analiziraj sliko dokumenta z dimenzijami {image_width}x{image_height} pikslov.
Izhodišče (0,0) je v zgornjem levem kotu. X raste desno, Y raste navzdol.

Za vsak tekstovni blok v dokumentu vrni:
- "text": točno viden tekst (ohrani vse znake, šumnike, številke)
- "x": piksel X zgornjega levega kota
- "y": piksel Y zgornjega levega kota
- "w": širina v pikslih
- "h": višina v pikslih

PRAVILA:
- Združi sosednje besede v logične bloke (običajno 1 vrstica ali kratka fraza, ~50-100 znakov).
- Bodi natančen pri pozicijah pikslov.
- Vključi VSE viden tekst: glave, naslove, telo, tabele (vsaka celica posebej), datume, podpise.
- NE izpuščaj nobenega teksta, tudi če izgleda nepomembno.

Vrni SAMO JSON v obliki: {{"blocks": [{{"text": "...", "x": 100, "y": 50, "w": 200, "h": 20}}, ...]}}
"""

    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"}
                    }
                ]
            }
        ]
    )

    try:
        data = json.loads(response.choices[0].message.content or "{}")
        return data.get("blocks", [])
    except json.JSONDecodeError as e:
        print(f"  ! JSON parse error: {e}")
        return []


def add_invisible_text_layer(
    pdf_path: str,
    blocks_per_page: dict,
    dpi: int = 200
):
    """
    Vbrizga nevidno tekstovno plast v PDF.
    To omogoči PyMuPDF page.search_for() da najde tekst v skeniranem PDF-ju.

    blocks_per_page: {page_number: [{"text": "...", "x":, "y":, "w":, "h":}, ...]}
    """
    # Scale faktor: piksli @ DPI → PDF točke (72 točk = 1 inch)
    scale = 72.0 / dpi

    doc = fitz.open(pdf_path)
    for page_num, page in enumerate(doc):
        blocks = blocks_per_page.get(page_num, [])

        for block in blocks:
            text = block.get("text", "").strip()
            if not text:
                continue

            try:
                x_pdf = float(block.get("x", 0)) * scale
                y_pdf = float(block.get("y", 0)) * scale
                w_pdf = float(block.get("w", 100)) * scale
                h_pdf = float(block.get("h", 12)) * scale

                # Robustnost: če bbox ni viable, preskoči
                if w_pdf < 1 or h_pdf < 1:
                    continue

                rect = fitz.Rect(x_pdf, y_pdf, x_pdf + w_pdf, y_pdf + h_pdf)

                # Fontsize: približno 70% višine bbox-a
                fontsize = max(h_pdf * 0.7, 4)

                # render_mode=3 → tekst se renderira ampak je NEVIDEN
                # (standardna PDF/A tehnika za OCR layer)
                page.insert_textbox(
                    rect,
                    text,
                    fontsize=fontsize,
                    color=(0, 0, 0),
                    render_mode=3,  # nevidno
                    overlay=True
                )
            except Exception as e:
                # Fail-safe: če insertion ne uspe, ne propade celoten proces
                print(f"  ! Layer insertion skip block: {e}")
                continue

    # Save in-place (PyMuPDF inkrementalni save)
    doc.saveIncr()
    doc.close()


def ocr_pdf_with_vision(pdf_path: str, dpi: int = 200) -> str:
    """
    Glavna funkcija:
    1. Procesira vsako stran skozi Vision LLM (dobimo tekst + pozicije)
    2. Doda nevidno tekstovno plast v PDF (za search_for podporo)
    3. Vrne kombiniran tekst za naslednji LLM klic
    """
    doc = fitz.open(pdf_path)
    full_text = ""
    blocks_per_page = {}

    for page_num, page in enumerate(doc):
        print(f"  → Vision OCR za stran {page_num + 1}/{len(doc)}...")
        try:
            image_b64, w, h = render_page_to_base64(page, dpi=dpi)
            blocks = extract_text_blocks_with_positions(image_b64, w, h)
            blocks_per_page[page_num] = blocks

            page_text = "\n".join(b.get("text", "") for b in blocks)
            full_text += f"\n--- Stran {page_num + 1} ---\n{page_text}\n"
            print(f"     {len(blocks)} blokov ekstrahiranih")
        except Exception as e:
            print(f"  ! NAPAKA pri strani {page_num + 1}: {e}")
            full_text += f"\n--- Stran {page_num + 1} (napaka) ---\n"

    doc.close()

    # Dodaj nevidno tekstovno plast za podporo highlightu
    if blocks_per_page:
        print(f"  → Vbrizgavam synthetic text layer...")
        try:
            add_invisible_text_layer(pdf_path, blocks_per_page, dpi=dpi)
            print(f"  → Text layer dodan ({sum(len(b) for b in blocks_per_page.values())} blokov)")
        except Exception as e:
            print(f"  ! Napaka pri text layer: {e}")

    return full_text


def is_scanned_pdf(pdf_path: str, threshold: int = 50) -> bool:
    """Heuristika: če povprečna stran vrne <threshold znakov, je skenirana."""
    doc = fitz.open(pdf_path)
    total_chars = sum(len(page.get_text()) for page in doc)
    page_count = len(doc)
    doc.close()

    if page_count == 0:
        return False
    return (total_chars / page_count) < threshold

def ocr_pdf_with_vision_with_blocks(pdf_path: str, dpi: int = 200):
    """
    Prebere tekst vsake strani prek Vision LLM (čisti tekst, brez koordinat).
    Vrne (full_text, text_per_page); text_per_page omogoča EasyOCR fallback
    za strani, kjer Vision vrne prazno.
    """
    doc = fitz.open(pdf_path)
    full_text = ""
    text_per_page = {}

    for page_num, page in enumerate(doc):
        print(f"  → Vision OCR za stran {page_num + 1}/{len(doc)}...")
        try:
            image_b64, w, h = render_page_to_base64(page, dpi=dpi)
            page_text = extract_page_text(image_b64)
            text_per_page[page_num] = page_text
            full_text += f"\n--- Stran {page_num + 1} ---\n{page_text}\n"
            print(f"     {len(page_text)} znakov prebranih")
        except Exception as e:
            print(f"  ! NAPAKA pri strani {page_num + 1}: {e}")
            text_per_page[page_num] = ""
            full_text += f"\n--- Stran {page_num + 1} (napaka) ---\n"

    doc.close()

    return full_text, text_per_page


def _ground_call(image_b64, fields, model=VISION_MODEL):
    """
    fields: list (key, value). Vrne list {key, box, confidence}.
    LLM vrne bounding box + lastno oceno zanesljivosti branja (čitljivost).
    """
    flist = "\n".join(f'{i+1}. [{k}] "{v}"' for i, (k, v) in enumerate(fields))
    prompt = (
        "Na sliki dokumenta poišči vsako od naslednjih vrednosti. Za vsako vrni:\n"
        "- box: bounding box [ymin, xmin, ymax, xmax], normaliziran na 0-1000 "
        "(ymin = vrh, xmin = levo)\n"
        "- confidence: število 0-100, kako zanesljivo prebereš to vrednost glede na "
        "čitljivost (jasen tisk ali jasen rokopis = visoko; zmazano, nejasno ali "
        "dvoumno = nizko)\n\n"
        f"Polja:\n{flist}\n\n"
        "Če vrednosti na sliki ne najdeš, jo izpusti.\n"
        'Vrni SAMO JSON: {"items": [{"key": "...", "box": [ymin, xmin, ymax, xmax], '
        '"confidence": 85}, ...]}'
    )
    resp = client.chat.completions.create(
        model=model,
        max_tokens=2000,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ]}],
    )
    try:
        data = json.loads(resp.choices[0].message.content or "{}")
        return data.get("items", [])
    except json.JSONDecodeError:
        return []


def ground_low_confidence(pdf_path, results, threshold=0.5, dpi=150):
    """
    Tier-2 lociranje: za polja s confidence pod pragom uporabi vision LLM grounding.
    LLM vrne bounding box + svojo oceno zanesljivosti (čitljivost). Uporabno za
    rokopis in slabe skene, kjer EasyOCR ne najde vrednosti.
    Spremeni results in-place (rectangles, page, confidence) ter ga vrne.
    """
    if not is_scanned_pdf(pdf_path):
        return results

    remaining = {
        k: v.get("value") for k, v in results.items()
        if (v.get("confidence") or 0) < threshold and v.get("value")
    }
    if not remaining:
        return results

    print(f"  → AI grounding za {len(remaining)} nizko-confidence polj...")
    doc = fitz.open(pdf_path)
    try:
        for page_num in range(len(doc)):
            if not remaining:
                break
            page = doc[page_num]
            pw, ph = page.rect.width, page.rect.height
            pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72))
            b64 = base64.b64encode(pix.tobytes("png")).decode()
            try:
                items = _ground_call(b64, list(remaining.items()))
            except Exception as e:
                print(f"  ! grounding napaka stran {page_num + 1}: {e}")
                continue
            for it in items:
                key = it.get("key")
                box = it.get("box") or it.get("box_2d")
                conf = it.get("confidence")
                if key not in remaining or not box or len(box) != 4:
                    continue
                ymin, xmin, ymax, xmax = box
                rect = {
                    "x": xmin / 1000 * pw,
                    "y": ymin / 1000 * ph,
                    "width": (xmax - xmin) / 1000 * pw,
                    "height": (ymax - ymin) / 1000 * ph,
                }
                results[key]["rectangles"] = [rect]
                results[key]["page"] = page_num
                if conf is not None:
                    results[key]["confidence"] = round(min(max(float(conf), 0), 100) / 100, 2)
                else:
                    results[key]["confidence"] = 0.6
                results[key]["method"] = "ai_grounding"
                del remaining[key]
    finally:
        doc.close()
    return results