from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import tempfile, os, json, shutil

from pdf_reader import extract_text
from prompt_builder import build_suggest_prompt, build_extract_prompt
from llm_client import call_llm
from confidence import find_coordinates_and_confidence

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mapa za shranjevanje PDF-jev
PDF_DIR = "pdfs"
os.makedirs(PDF_DIR, exist_ok=True)

app.mount("/pdfs", StaticFiles(directory=PDF_DIR), name="pdfs")

@app.get("/")
def root():
    return {"status": "DocAgent backend teče"}

@app.post("/api/suggest-fields")
async def suggest_fields(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        text = extract_text(tmp_path)
        prompt = build_suggest_prompt(text)
        raw = call_llm(prompt)

        result = json.loads(raw)
        return result
    finally:
        os.remove(tmp_path)

@app.post("/api/extract")
async def extract(file: UploadFile = File(...), fields: str = Form("[]")):
    pdf_filename = f"{file.filename}"
    pdf_path = os.path.join(PDF_DIR, pdf_filename)

    content = await file.read()
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        text = extract_text(pdf_path)
        fields_list = json.loads(fields)
        print("FIELDS PREJETE:", fields_list)
        print("ŠT. POLJ:", len(fields_list))
        prompt = build_extract_prompt(fields_list, text)
        raw = call_llm(prompt)

        print("==== RAW LLM ODGOVOR ====")
        print(raw)
        print("=========================")

        extraction = json.loads(raw)

        # Če je LLM zavil odgovor v zunanji ključ, ga odkrijemo
        if len(extraction) == 1:
            only_key = list(extraction.keys())[0]
            inner = extraction[only_key]
            if isinstance(inner, dict):
                field_keys = {f["key"] for f in fields_list}
                if not (field_keys & set(extraction.keys())):
                    print(f"Odgovor je zavit v ključ '{only_key}', odvijem...")
                    extraction = inner

        results = find_coordinates_and_confidence(pdf_path, extraction)

        return {
            "pdf_url": f"http://localhost:8000/pdfs/{pdf_filename}",
            "results": results
        }
    except Exception as e:
        print(f"NAPAKA v extract: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}