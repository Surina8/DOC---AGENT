import fitz # PyMuPDF

def calculate_confidence(value, source_text, num_instances_found):
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


def find_coordinates_and_confidence(pdf_path, extraction_result):
    doc = fitz.open(pdf_path)
    results = {}

    for key, data in extraction_result.items():
        # Če LLM vrne direkten string namesto {value, source_text}
        if isinstance(data, str):
            data = {"value": data, "source_text": data}
        elif not isinstance(data, dict):
            continue

        value = data.get("value")
        source_text = data.get("source_text")

        if not source_text or value is None:
            results[key] = {
                "value": value,
                "source_text": source_text,
                "confidence": 0.0,
                "rectangles": [],
                "page": None
            }
            continue

        found = False
        for page_num, page in enumerate(doc):
            instances = page.search_for(source_text)
            if instances:
                rectangles = [
                    {"x": r.x0, "y": r.y0, "width": r.width, "height": r.height}
                    for r in instances
                ]
                results[key] = {
                    "value": value,
                    "source_text": source_text,
                    "confidence": round(calculate_confidence(value, source_text, len(instances)), 2),
                    "rectangles": rectangles,
                    "page": page_num
                }
                found = True
                break

            if not found and value:
                instances2 = page.search_for(str(value))
                if instances2:
                    rectangles = [
                        {"x": r.x0, "y": r.y0, "width": r.width, "height": r.height}
                        for r in instances2
                    ]
                    results[key] = {
                        "value": value,
                        "source_text": source_text,
                        "confidence": 0.55,
                        "rectangles": rectangles,
                        "page": page_num
                    }
                    found = True
                    break

        if not found:
            results[key] = {
                "value": value,
                "source_text": source_text,
                "confidence": 0.0,
                "rectangles": [],
                "page": None
            }

    doc.close()
    return results