from fastapi import FastAPI, UploadFile, File
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
async def extract(file: UploadFile = File(...), fields: str = "[]"):
    # Shrani PDF trajno za prikaz v review
    pdf_filename = f"{file.filename}"
    pdf_path = os.path.join(PDF_DIR, pdf_filename)

    content = await file.read()
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        text = extract_text(pdf_path)
        fields_list = json.loads(fields)
        prompt = build_extract_prompt(fields_list, text)
        raw = call_llm(prompt)
        extraction = json.loads(raw)

        # Poišči koordinate in izračunaj confidence
        results = find_coordinates_and_confidence(pdf_path, extraction)

        return {
            "pdf_url": f"http://localhost:8000/pdfs/{pdf_filename}",
            "results": results
        }
    except Exception as e:
        return {"error": str(e)}