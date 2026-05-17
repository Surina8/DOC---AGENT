import re
import fitz
from difflib import SequenceMatcher


# ─────────────────────────────────────────────────────────────
# HELPER FUNKCIJE
# ─────────────────────────────────────────────────────────────

def _normalize_match(s):
    """Lowercase + collapse whitespace."""
    return ' '.join(s.lower().split()) if s else ""


def _alphanum_only(s):
    """Lowercase + samo alphanumeric (za ID-je in številke z razmiki)."""
    return re.sub(r'[^a-z0-9]', '', s.lower()) if s else ""


def _block_to_rect_dict(block, scale, padding=2):
    """Posamezni blok → rect dict s paddingom."""
    x = float(block.get("x", 0)) - padding
    y = float(block.get("y", 0)) - padding
    w = float(block.get("w", 100)) + 2 * padding
    h = float(block.get("h", 12)) + 2 * padding
    return {
        "x": x * scale,
        "y": y * scale,
        "width": w * scale,
        "height": h * scale,
    }


def _union_to_rect_dict(blocks, scale, padding=2):
    """Več blokov → en pravokotnik ki jih vse zajame."""
    if not blocks:
        return None
    xs = [float(b.get("x", 0)) for b in blocks]
    ys = [float(b.get("y", 0)) for b in blocks]
    xes = [float(b.get("x", 0)) + float(b.get("w", 0)) for b in blocks]
    yes = [float(b.get("y", 0)) + float(b.get("h", 0)) for b in blocks]
    x_min = min(xs) - padding
    y_min = min(ys) - padding
    x_max = max(xes) + padding
    y_max = max(yes) + padding
    return {
        "x": x_min * scale,
        "y": y_min * scale,
        "width": (x_max - x_min) * scale,
        "height": (y_max - y_min) * scale,
    }


def _all_same_line(blocks):
    """Vsi bloki na isti vrstici?"""
    if not blocks or len(blocks) == 1:
        return True
    avg_h = sum(b.get('h', 12) for b in blocks) / len(blocks)
    ys = [b.get('y', 0) for b in blocks]
    return (max(ys) - min(ys)) < avg_h * 1.0


def calculate_confidence(value, source_text, num_instances_found):
    """Legacy confidence calc za digitalne PDF-je (PyMuPDF flow)."""
    if not source_text or value is None:
        return 0.0
    if num_instances_found == 0:
        return 0.0
    if num_instances_found == 1:
        base = 0.95
    elif num_instances_found == 2:
        base = 0.85
    else:
        base = 0.70
    value_str = str(value).strip().lower()
    source_lower = source_text.lower()
    if value_str in source_lower:
        return base
    else:
        return base - 0.15


# ─────────────────────────────────────────────────────────────
# STRATEGIJE UJEMANJA
# ─────────────────────────────────────────────────────────────

def _find_consecutive_blocks(value_words, blocks):
    """Strategy 3: Sosednji bloki za zaporedne besede value-ja."""
    if not value_words or not blocks:
        return None

    word_candidates = []
    for word in value_words:
        candidates = []
        for block in blocks:
            bt_norm = _normalize_match(block.get("text", ""))
            if not bt_norm:
                continue
            if len(word) == 1:
                if bt_norm == word:
                    candidates.append((block, 1.0))
            else:
                if bt_norm == word:
                    candidates.insert(0, (block, 1.0))
                elif word in bt_norm and len(bt_norm) <= len(word) * 3:
                    candidates.append((block, 0.7))
        word_candidates.append(candidates)

    if not word_candidates[0]:
        return None

    best_chain = None
    best_score = 0

    for anchor, anchor_score in word_candidates[0]:
        chain = [anchor]
        prev = anchor

        for word_idx in range(1, len(value_words)):
            candidates = word_candidates[word_idx]
            if not candidates:
                continue

            best_next = None
            best_dist = float("inf")

            for cand_block, _ in candidates:
                y_diff = abs(cand_block["y"] - prev["y"])
                avg_h = (cand_block["h"] + prev["h"]) / 2
                if y_diff > avg_h * 1.5:
                    continue
                x_offset = cand_block["x"] - (prev["x"] + prev["w"])
                if x_offset < -prev["w"]:
                    continue
                dist = y_diff + max(0, x_offset)
                if dist < best_dist:
                    best_dist = dist
                    best_next = cand_block

            if best_next is not None:
                chain.append(best_next)
                prev = best_next

        coverage = len(chain) / len(value_words)
        score = coverage * anchor_score
        if score > best_score:
            best_score = score
            best_chain = chain

    if best_chain and best_score >= 0.5:
        return (best_chain, best_score)
    return None


def _find_via_label_proximity(value, source_text, blocks_per_page, dpi=200):
    """
    Strategy 5: Najdi LABEL (tipkan, zanesljiv) → uporabi prostor desno
    za bbox value-ja (rokopis, OCR ga ne prebere).
    """
    if not source_text:
        return None

    # Extract label (text before colon)
    parts = source_text.split(':', 1)
    if len(parts) < 2:
        return None
    label = parts[0].strip()
    if not label or len(label) < 4:
        return None

    # Skip generic labels (premalo specifični)
    if label.lower() in {'paket', 'akcija', 'kontakt', 'datum', 'cena', 'agent', 'opis', 'cena/enoto'}:
        return None

    scale = 72.0 / dpi
    label_norm = _normalize_match(label)

    best_overall = None
    best_overall_score = 0

    for page_num, blocks in blocks_per_page.items():
        try:
            page_num = int(page_num)
        except (ValueError, TypeError):
            continue

        # Najdi vse label kandidate
        label_candidates = []
        for block in blocks:
            bt_norm = _normalize_match(block.get('text', ''))
            if not bt_norm:
                continue

            if label_norm in bt_norm:
                if len(bt_norm) < len(label_norm) * 3:
                    label_candidates.append((block, 0.95))
                else:
                    label_candidates.append((block, 0.80))
                continue

            sim = SequenceMatcher(None, label_norm, bt_norm).ratio()
            if sim > 0.75:
                label_candidates.append((block, sim))

        if not label_candidates:
            continue

        label_candidates.sort(key=lambda c: c[1], reverse=True)

        for label_block, label_sim in label_candidates:
            # Bloki desno od label-a, ista vrstica
            label_y = label_block['y']
            label_h = label_block['h']
            label_x_end = label_block['x'] + label_block['w']

            same_line_candidates = []

            for block in blocks:
                if block == label_block:
                    continue

                bx = block['x']
                by = block['y']
                bh = block['h']
                bt = block.get('text', '')

                # Preskoci ostale label-e (vsebujejo dvopičje)
                if ':' in bt and len(bt) > 5:
                    continue

                # Same line
                avg_h = (label_h + bh) / 2
                y_dist = abs(by - label_y)
                if y_dist > avg_h * 1.0:
                    continue

                # Desno od label-a
                if bx < label_x_end - 20:
                    continue

                x_dist = bx - label_x_end

                # Daleč desno → verjetno drugo polje
                if x_dist > 600:
                    continue

                same_line_candidates.append(block)

            if not same_line_candidates:
                continue

            # Sortiraj po x, vzemi zaporedne
            same_line_candidates.sort(key=lambda b: b['x'])
            value_blocks = [same_line_candidates[0]]
            for block in same_line_candidates[1:]:
                last = value_blocks[-1]
                gap = block['x'] - (last['x'] + last['w'])
                if gap > last['w'] * 4:
                    break
                value_blocks.append(block)
                if len(value_blocks) >= 6:
                    break

            if value_blocks:
                union_rect = _union_to_rect_dict(value_blocks, scale)
                # Score: label_sim + bonus za število value blokov
                score = label_sim * (1 + 0.1 * min(len(value_blocks), 3))

                if score > best_overall_score:
                    best_overall_score = score
                    conf = 0.65 if label_sim >= 0.9 else 0.50
                    best_overall = (page_num, [union_rect], conf)

    return best_overall


def _find_in_ocr_blocks(value, source_text, blocks_per_page, dpi=200):
    """
    Glavna matching funkcija s 5 strategijami.
    """
    if value is None or not str(value).strip():
        return None

    value_str = str(value).strip()
    value_norm = _normalize_match(value_str)
    value_alnum = _alphanum_only(value_str)
    value_words = value_norm.split()
    scale = 72.0 / dpi

    all_matches = []  # (score, page_num, rects, confidence)

    for page_num, blocks in blocks_per_page.items():
        try:
            page_num = int(page_num)
        except (ValueError, TypeError):
            continue

        # === Strategy 1 + 2: Single block matching ===
        for block in blocks:
            bt = block.get("text", "")
            bt_norm = _normalize_match(bt)
            bt_alnum = _alphanum_only(bt)
            if not bt_norm:
                continue

            # 1. Exact (normalized)
            if bt_norm == value_norm:
                return (page_num, [_block_to_rect_dict(block, scale)], 0.85)
            # 1b. Exact (alphanumeric)
            if bt_alnum and bt_alnum == value_alnum and len(value_alnum) >= 4:
                return (page_num, [_block_to_rect_dict(block, scale)], 0.85)

            # 2. Value substring of block
            if value_norm in bt_norm and len(bt_norm) <= len(value_norm) * 3:
                all_matches.append((1.0, page_num, [_block_to_rect_dict(block, scale)], 0.85))
                continue

            if value_alnum and value_alnum in bt_alnum and len(value_alnum) >= 4 and len(bt_alnum) <= len(value_alnum) * 3:
                all_matches.append((1.0, page_num, [_block_to_rect_dict(block, scale)], 0.85))
                continue

            # 4. Fuzzy single block
            if min(len(bt_norm), len(value_norm)) > 0:
                len_ratio = min(len(bt_norm), len(value_norm)) / max(len(bt_norm), len(value_norm))
                if len_ratio >= 0.5:
                    sim = SequenceMatcher(None, value_norm, bt_norm).ratio()
                    if sim >= 0.7:
                        conf = 0.85 if sim >= 0.85 else 0.65
                        all_matches.append((sim, page_num, [_block_to_rect_dict(block, scale)], conf))

        # === Strategy 3 + 4 multi: Multi-block matching ===
        if len(value_words) >= 2:
            # 3. Multi-word adjacent
            adj_match = _find_consecutive_blocks(value_words, blocks)
            if adj_match:
                matched_blocks, coverage = adj_match
                if coverage >= 0.5:
                    union_rect = _union_to_rect_dict(matched_blocks, scale)
                    all_matches.append((0.95 * coverage, page_num, [union_rect], 0.85))

            # 4. Fuzzy combined adjacent blocks
            sorted_blocks = sorted(blocks, key=lambda b: (b.get('y', 0) // 20, b.get('x', 0)))
            for i in range(len(sorted_blocks)):
                for window_size in [2, 3, 4]:
                    if i + window_size > len(sorted_blocks):
                        break
                    window = sorted_blocks[i:i + window_size]
                    if not _all_same_line(window):
                        continue
                    combined = ' '.join(_normalize_match(b.get("text", "")) for b in window)
                    if not combined:
                        continue
                    len_ratio = min(len(combined), len(value_norm)) / max(len(combined), len(value_norm))
                    if len_ratio < 0.5:
                        continue
                    sim = SequenceMatcher(None, value_norm, combined).ratio()
                    if sim >= 0.7:
                        conf = 0.85 if sim >= 0.85 else 0.65
                        union_rect = _union_to_rect_dict(window, scale)
                        all_matches.append((sim, page_num, [union_rect], conf))

    # Najboljši match iz strategij 1-4
    if all_matches:
        best = max(all_matches, key=lambda x: x[0])
        # Vrnemo zelo dober match takoj
        if best[0] >= 0.85:
            return (best[1], best[2], best[3])

    # === Strategy 5: Label-proximity (za rokopis/težko branje) ===
    result = _find_via_label_proximity(value, source_text, blocks_per_page, dpi)
    if result:
        # Če imamo še boljši match iz strategij 1-4, primerjajmo
        if all_matches:
            best = max(all_matches, key=lambda x: x[0])
            # Label proximity ima fixed conf 0.50-0.65
            # Če je strategy 1-4 best > 0.7 sim, raje uporabimo to
            if best[0] >= 0.7:
                return (best[1], best[2], best[3])
        return result

    # Zadnji izhod: strategy 1-4 z nižjo confidence
    if all_matches:
        best = max(all_matches, key=lambda x: x[0])
        return (best[1], best[2], best[3])

    return None


def _search_candidates(value, source_text):
    """Iskalni kandidati za PyMuPDF (digital PDF flow)."""
    candidates = []
    if source_text:
        candidates.append(source_text)
        clean = source_text.replace("\n", " ").strip()
        if clean and clean != source_text:
            candidates.append(clean)
        first_line = source_text.split("\n")[0].strip()
        if first_line and first_line != source_text:
            candidates.append(first_line)
    if value is not None:
        clean_value = str(value).strip()
        if clean_value:
            candidates.append(clean_value)
            words = clean_value.split()
            if words and len(words[0]) > 2:
                candidates.append(words[0])
    seen = set()
    return [c for c in candidates if c and not (c in seen or seen.add(c))]


# ─────────────────────────────────────────────────────────────
# GLAVNA FUNKCIJA
# ─────────────────────────────────────────────────────────────

def find_coordinates_and_confidence(pdf_path, extraction_result):
    """
    OCR dokument: direktno iskanje skozi EasyOCR bloke (5 strategij)
    Digitalni PDF: PyMuPDF search_for
    """
    try:
        from pdf_reader import get_ocr_blocks
        ocr_blocks = get_ocr_blocks(pdf_path)
    except ImportError:
        ocr_blocks = None

    doc = fitz.open(pdf_path)
    results = {}

    for key, data in extraction_result.items():
        if isinstance(data, str):
            data = {"value": data, "source_text": data}
        elif not isinstance(data, dict):
            continue

        value = data.get("value")
        source_text = data.get("source_text")

        if value is None and not source_text:
            results[key] = {
                "value": value,
                "source_text": source_text,
                "confidence": 0.0,
                "rectangles": [],
                "page": None,
            }
            continue

        # OCR dokument → 5 strategij
        if ocr_blocks:
            ocr_result = _find_in_ocr_blocks(value, source_text, ocr_blocks)
            if ocr_result:
                page_num, rectangles, confidence = ocr_result
                results[key] = {
                    "value": value,
                    "source_text": source_text,
                    "confidence": confidence,
                    "rectangles": rectangles,
                    "page": page_num,
                }
            else:
                results[key] = {
                    "value": value,
                    "source_text": source_text,
                    "confidence": 0.0,
                    "rectangles": [],
                    "page": None,
                }
            continue

        # Digital PDF: PyMuPDF
        found = False
        for page_num, page in enumerate(doc):
            candidates = _search_candidates(value, source_text)
            instances = None
            matched_text = None

            for candidate in candidates:
                inst = page.search_for(candidate)
                if inst:
                    instances = inst
                    matched_text = candidate
                    break

            if instances:
                rectangles = [
                    {"x": r.x0, "y": r.y0, "width": r.width, "height": r.height}
                    for r in instances
                ]
                base_conf = calculate_confidence(value, source_text, len(instances))
                if matched_text != source_text:
                    base_conf = max(0.5, base_conf - 0.2)
                results[key] = {
                    "value": value,
                    "source_text": source_text,
                    "confidence": round(base_conf, 2),
                    "rectangles": rectangles,
                    "page": page_num,
                }
                found = True
                break

        if not found:
            results[key] = {
                "value": value,
                "source_text": source_text,
                "confidence": 0.0,
                "rectangles": [],
                "page": None,
            }

    doc.close()
    return results


def debug_print_blocks(pdf_path, value_to_find=None):
    """Debug helper — pokliče se iz main.py za diagnostiko."""
    try:
        from pdf_reader import get_ocr_blocks
        blocks_per_page = get_ocr_blocks(pdf_path)
        if not blocks_per_page:
            print("DEBUG: Ni OCR blokov (digitalni PDF?)")
            return

        print("\n========== EasyOCR BLOKI ==========")
        for page_num, blocks in blocks_per_page.items():
            print(f"\n--- Stran {page_num} ---")
            for b in blocks:
                print(f"  '{b.get('text', '')}' @ ({b.get('x', 0):.0f},{b.get('y', 0):.0f}) conf={b.get('confidence', 0):.2f}")

        if value_to_find:
            print(f"\n========== ISKANJE '{value_to_find}' ==========")
            value_norm = _normalize_match(str(value_to_find))
            for page_num, blocks in blocks_per_page.items():
                for b in blocks:
                    bt_norm = _normalize_match(b.get('text', ''))
                    if not bt_norm:
                        continue
                    sim = SequenceMatcher(None, value_norm, bt_norm).ratio()
                    if sim >= 0.5:
                        print(f"  '{bt_norm}' similarity={sim:.2f}")
        print("===================================\n")
    except Exception as e:
        print(f"DEBUG napaka: {e}")