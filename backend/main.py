from fastapi import FastAPI, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import tempfile, os, json, fitz

from pdf_reader import extract_text
from prompt_builder import build_suggest_prompt, build_extract_prompt
from llm_client import call_llm
from confidence import find_coordinates_and_confidence
from database import get_db
from models import Document, Extraction, Field

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def extract(
    file: UploadFile = File(...),
    fields: str = Form("[]"),
    db: Session = Depends(get_db)
):
    pdf_filename = f"{file.filename}"
    pdf_path = os.path.join(PDF_DIR, pdf_filename)

    content = await file.read()
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        # 1) Pridobi tekst in št. strani
        text = extract_text(pdf_path)
        with fitz.open(pdf_path) as pdf_doc:
            total_pages = pdf_doc.page_count

        fields_list = json.loads(fields)
        print("FIELDS PREJETE:", len(fields_list), "polj")

        # 2) Ustvari Document zapis v bazi
        document = Document(
            filename=file.filename,
            pdf_path=pdf_path,
            total_pages=total_pages,
            document_text=text,
            status="pending"
        )
        db.add(document)
        db.flush()  # Dobimo document.id še preden commit
        print(f"USTVARJEN Document: {document.id}")

        # 3) Pokliči LLM
        prompt = build_extract_prompt(fields_list, text)
        raw = call_llm(prompt)

        print("==== RAW LLM ODGOVOR ====")
        print(raw)
        print("=========================")

        extraction_data = json.loads(raw)

        # 4) Najdi koordinate in confidence
        results = find_coordinates_and_confidence(pdf_path, extraction_data)

        # 5) Izračunaj povprečno confidence
        confidences = [
            v["confidence"] for v in results.values()
            if v.get("confidence") is not None
        ]
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        # 6) Ustvari Extraction zapis
        extraction = Extraction(
            document_id=document.id,
            model_used="openai/gpt-4o-mini",
            avg_confidence=avg_conf,
            raw_llm_response=extraction_data
        )
        db.add(extraction)
        db.flush()
        print(f"USTVARJEN Extraction: {extraction.id} (avg_conf={avg_conf:.2f})")

        # 7) Ustvari Field zapise za vsako polje
        for field_key, field_data in results.items():
            field_record = Field(
                extraction_id=extraction.id,
                field_key=field_key,
                field_value=field_data.get("value"),
                source_text=field_data.get("source_text"),
                confidence=field_data.get("confidence") or 0.0,
                page_number=field_data.get("page"),
                rectangles=field_data.get("rectangles", [])
            )
            db.add(field_record)

        db.commit()
        print(f"SHRANJENO V BAZO: {len(results)} polj")

        return {
            "document_id": str(document.id),
            "pdf_url": f"http://localhost:8000/pdfs/{pdf_filename}",
            "results": results
        }

    except Exception as e:
        db.rollback()
        print(f"NAPAKA v extract: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
    
@app.get("/api/documents")
def list_documents(db: Session = Depends(get_db)):
    """
    Vrne seznam vseh dokumentov, sortiran po datumu naloženja (najnovejši prvi).
    Vsak dokument vključuje povzetek zadnje ekstrakcije.
    """
    docs = db.query(Document).order_by(Document.upload_date.desc()).all()

    result = []
    for doc in docs:
        # Vzemi zadnjo ekstrakcijo (po datumu)
        latest_extraction = None
        if doc.extractions:
            latest_extraction = max(doc.extractions, key=lambda e: e.extraction_date)

        result.append({
            "id": str(doc.id),
            "filename": doc.filename,
            "upload_date": doc.upload_date.isoformat(),
            "total_pages": doc.total_pages,
            "status": doc.status,
            "field_count": len(latest_extraction.fields) if latest_extraction else 0,
            "avg_confidence": latest_extraction.avg_confidence if latest_extraction else None,
        })

    return {"documents": result}


@app.get("/api/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db)):
    """
    Vrne podrobnosti enega dokumenta z vsemi polji zadnje ekstrakcije.
    Format je enak kot `/api/extract` response, da lahko frontend
    Review stran uporabi isti UI.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return {"error": "Dokument ne obstaja"}

    if not doc.extractions:
        return {"error": "Dokument še nima ekstrakcij"}

    latest = max(doc.extractions, key=lambda e: e.extraction_date)

    # Sestavi results dict v isti obliki kot extract endpoint
    results = {}
    for field in latest.fields:
        results[field.field_key] = {
            "value": field.field_value,
            "source_text": field.source_text,
            "confidence": field.confidence,
            "page": field.page_number,
            "rectangles": field.rectangles or [],
        }

    return {
        "document_id": str(doc.id),
        "filename": doc.filename,
        "upload_date": doc.upload_date.isoformat(),
        "total_pages": doc.total_pages,
        "status": doc.status,
        "pdf_url": f"http://localhost:8000/pdfs/{doc.filename}",
        "results": results,
    }


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    """
    Izbriše dokument in vse povezane podatke (extraction, fields).
    Cascade delete v models.py poskrbi za otroke.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return {"error": "Dokument ne obstaja"}

    pdf_path = doc.pdf_path

    db.delete(doc)
    db.commit()

    # Izbriši še PDF datoteko z diska
    if os.path.exists(pdf_path):
        try:
            os.remove(pdf_path)
        except Exception as e:
            print(f"Opozorilo: PDF ni mogel biti izbrisan: {e}")

    return {"status": "izbrisano"}