import fitz

def find_coordinates_and_confidence(pdf_path, extraction_result):
    doc = fitz.open(pdf_path)
    results = {}

    for key, data in extraction_result.items():
        if not isinstance(data, dict):
            continue

        value = data.get("value")
        source_text = data.get("source_text")

        if not source_text or value is None:
            results[key] = {
                "value": value,
                "source_text": source_text,
                "confidence": 0.0,
                "coordinates": None,
                "page": None
            }
            continue

        found = False
        for page_num, page in enumerate(doc):
            instances = page.search_for(source_text)
            if instances:
                rect = instances[0]
                results[key] = {
                    "value": value,
                    "source_text": source_text,
                    "confidence": round(0.95 - (len(instances) - 1) * 0.1, 2),
                    "coordinates": {
                        "x": rect.x0,
                        "y": rect.y0,
                        "width": rect.width,
                        "height": rect.height
                    },
                    "page": page_num
                }
                found = True
                break

            # Poskusi z vrednostjo če source_text ni najden
            if not found and value:
                instances2 = page.search_for(str(value))
                if instances2:
                    rect = instances2[0]
                    results[key] = {
                        "value": value,
                        "source_text": source_text,
                        "confidence": 0.65,
                        "coordinates": {
                            "x": rect.x0,
                            "y": rect.y0,
                            "width": rect.width,
                            "height": rect.height
                        },
                        "page": page_num
                    }
                    found = True
                    break

        if not found:
            results[key] = {
                "value": value,
                "source_text": source_text,
                "confidence": 0.0,
                "coordinates": None,
                "page": None
            }

    doc.close()
    return results