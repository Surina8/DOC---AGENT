def build_suggest_prompt(document_text):
    return f"""
Si agent za analizo dokumentov. Poglej spodnji dokument in predlagaj
VSA polja ki bi bila smiselna za ekstrakcijo.

Vrni SAMO JSON v tej obliki — brez dodatnega teksta:
{{
  "fields": [
    {{"key": "dobavitelj", "description": "Ime dobavitelja"}},
    {{"key": "skupni_znesek", "description": "Skupni znesek"}}
  ]
}}

PRAVILA:
- Predlagaj VSA polja ki bi bila relevantna in jih je možno ekstrahirati.
- Ne omejuj se na število — če je 20 smiselnih polj, predlagaj 20.
- Ne predlagaj polj ki se v dokumentu ne pojavijo.
- Ključi NAJ BODO v slovenščini, v snake_case obliki (male črke, presledki zamenjani s _).
- Brez šumnikov v ključih (š→s, č→c, ž→z) — samo ASCII znaki.
- Opisi naj bodo v slovenščini.
- Za pogodbe predlagaj: stranke, datume, vrednosti, kontaktne podatke, plačilne pogoje, roke, obveznosti.
- Za račune predlagaj: izdajatelja, prejemnika, postavke, zneske, datume.

Dokument:
{document_text[:4000]}
"""

def build_extract_prompt(fields, document_text):
    import json

    # Strogi seznam dovoljenih ključev
    allowed_keys = [f["key"] for f in fields]
    
    field_list_str = ""
    for i, field in enumerate(fields):
        field_list_str += f'  - "{field["key"]}": {field["description"]}\n'

    example = {}
    for f in fields:
        example[f["key"]] = {
            "value": "ekstrahirana vrednost ali null",
            "source_text": "točen citat iz dokumenta ali null"
        }
    example_str = json.dumps(example, ensure_ascii=False, indent=2)

    return f"""Si agent za ekstrakcijo podatkov iz dokumentov.

KRITIČNO PRAVILO:
Vrni JSON s točno temi {len(allowed_keys)} ključi - NE več, NE manj, NE drugačnih:
{json.dumps(allowed_keys, ensure_ascii=False)}

Polja in kaj iskati:
{field_list_str}

Za vsak ključ vrni objekt:
- "value": ekstrahirana vrednost (string, ali null če ne najdeš)
- "source_text": točen dobesedni citat iz dokumenta kjer si našel podatek

PRAVILA:
1. Imena ključev morajo biti EKSAKTNO kot zgoraj — z istim casing, brez sprememb.
2. Ne dodajaj novih ključev. Ne preimenuj obstoječih.
3. Če podatka ne najdeš, vrni null za value in source_text.
4. source_text mora biti DOBESEDEN niz iz dokumenta (isti znaki).
5. Nikoli ne ugibaj.

PRIČAKOVAN FORMAT:
{example_str}

DOKUMENT:
{document_text[:4000]}
"""