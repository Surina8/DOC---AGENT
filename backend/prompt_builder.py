def build_suggest_prompt(document_text):
    return f"""
Si agent za analizo dokumentov. Poglej spodnji dokument in predlagaj
KLJUČNA polja ki bi bila smiselna za ekstrakcijo v IDP sistem.

Vrni SAMO JSON v tej obliki - brez dodatnega teksta:
{{
  "fields": [
    {{"key": "dobavitelj", "description": "Ime dobavitelja"}},
    {{"key": "skupni_znesek", "description": "Skupni znesek na računu"}}
  ]
}}

PRAVILA - KAJ PREDLAGATI:
- Predlagaj 10-20 KLJUČNIH polj — fokusiraj se na poslovno VREDNE podatke
- Prednost dajaj: identifikatorji (številke, davčne, matične), vrednosti, datumi, stranke, predmet pogodbe/računa
- Ključi v slovenščini, snake_case obliki (male črke, presledki zamenjani z _)
- Brez šumnikov v ključih (š→s, č→c, ž→z) — samo ASCII znaki
- Opisi naj bodo polni slovenski stavki

PRAVILA - KAJ NE PREDLAGATI:
- NE razdrobi tabel/postavk v ploska polja (npr. ne "postavka_1_cena", "postavka_1_kolicina", "postavka_2_cena"...). 
  Za tabele predlagaj največ eno polje kot opis vsebine (npr. "postavke_storitev": "Seznam postavk s ceno in količino").
- NE dodajaj administrativnih detajlov ki se redko razlikujejo od osnovnih (kraji podpisov če imamo datum sklenitve, banke če imamo IBAN, itd.)
- NE dodajaj dveh polj za isto stvar (npr. če imaš "vrednost_z_ddv", ne dodajaj še "skupaj_z_ddv")
- NE dodajaj polj ki jih v dokumentu ni

Primeri pravilnih ključev:
- stevilka_pogodbe, datum_sklenitve, vrednost_pogodbe
- ime_narocnika, naslov_izvajalca, placilni_pogoji
- davcna_stevilka, maticna_stevilka, kontaktna_oseba

Dokument:
{document_text[:15000]}
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
{document_text[:15000]}
"""