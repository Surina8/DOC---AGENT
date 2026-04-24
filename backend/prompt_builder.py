def build_suggest_prompt(document_text):
    return f"""
Si agent za analizo dokumentov. Poglej spodnji dokument in predlagaj
katera polja bi bilo smiselno ekstrahirati.

Vrni SAMO JSON v tej obliki - brez dodatnega teksta:
{{
  "fields": [
    {{"key": "vendor", "description": "Ime dobavitelja"}},
    {{"key": "amount", "description": "Skupni znesek"}}
  ]
}}

Predlagaj 4-8 polj ki so relevantna za ta dokument.
Ključi naj bodo v angleščini (brez presledkov), opisi v slovenščini.

Dokument:
{document_text[:3000]}
"""

def build_extract_prompt(fields, document_text):
    field_definitions = ""
    for field in fields:
        field_definitions += f'- "{field["key"]}": {field["description"]}\n'

    field_keys = {f["key"] for f in fields}
    empty_json = {}
    for f in fields:
        empty_json[f["key"]] = {"value": None, "source_text": None}

    import json
    empty_str = json.dumps(empty_json, ensure_ascii=False, indent=2)

    return f"""
Si agent za ekstrakcijo strukturiranih podatkov iz dokumentov.

Ekstrahiraj VSA naslednja polja iz dokumenta. 
OBVEZNO vrni JSON z VSEMI spodnjimi ključi — tudi če vrednosti ne najdeš (vrni null):

{field_definitions}

Za vsako polje vrni tudi source_text — točen tekstovni fragment iz dokumenta.
Če polja ne najdeš, vrni null za value in source_text.

Vrni SAMO JSON v tej obliki (z vsemi ključi):
{empty_str}

Dokument:
{document_text[:4000]}
"""