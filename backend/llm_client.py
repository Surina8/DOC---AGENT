import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY")
)

def call_llm(prompt, model="openai/gpt-4o-mini"):
    response = client.chat.completions.create(
        model=model,
        temperature=1,
        seed=42,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": prompt}
        ]
    )
    return response.choices[0].message.content