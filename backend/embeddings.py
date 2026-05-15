"""
Modul za generiranje embedding-ov preko OpenRouter (OpenAI text-embedding-3-small).
Embedding je 1536-dimenzionalni vektor ki predstavlja semantično "lokacijo" teksta.
Podobni teksti imajo podobne vektorje (mala kosinusna razdalja).
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Uporabimo isti OpenRouter client kot za LLM
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY")
)

EMBEDDING_MODEL = "openai/text-embedding-3-small"
EMBEDDING_DIM = 1536


def generate_embedding(text: str) -> list[float]:
    """
    Generira 1536-dimenzionalni embedding vektor za podan tekst.

    Args:
        text: Tekstovni dokument (do ~8000 tokenov ≈ 30000 znakov)

    Returns:
        List 1536 float vrednosti
    """
    if not text or not text.strip():
        # Vrni ničelni vektor za prazen tekst
        return [0.0] * EMBEDDING_DIM

    # OpenAI omejuje na 8192 tokenov - ~30000 znakov je varna meja
    truncated = text[:30000]

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=truncated
    )

    return response.data[0].embedding


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """
    Izračuna kosinusno podobnost med dvema vektorjema.
    Rezultat: 0.0 (popolnoma drugačna) do 1.0 (identična).

    Uporabljeno samo za debug — v produkciji uporabljamo pgvector
    `<=>` operator ki je veliko hitrejši.
    """
    import math
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)