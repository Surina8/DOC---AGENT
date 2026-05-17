import os
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY")
)

EXTRACTION_MODEL = "anthropic/claude-sonnet-4.5"


def _clean_json_response(raw: str) -> str:
    """
    Odstrani markdown kodne bloke iz LLM odgovora.
    Claude pogosto ovije JSON v ```json ... ``` čeprav je
    response_format nastavljen na json_object.
    """
    if not raw:
        return raw

    raw = raw.strip()

    # Odstrani ```json ali ``` na začetku
    raw = re.sub(r'^```(?:json)?\s*\n?', '', raw)
    # Odstrani ``` na koncu
    raw = re.sub(r'\n?```\s*$', '', raw)

    return raw.strip()


def call_llm(prompt, model=EXTRACTION_MODEL):
    """
    Glavni LLM klic za ekstrakcijo strukturiranih podatkov.
    Avtomatsko očisti markdown wrapper-je iz odgovora.
    """
    response = client.chat.completions.create(
        model=model,
        temperature=0,
        seed=42,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": prompt}
        ]
    )
    raw = response.choices[0].message.content
    return _clean_json_response(raw)