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

from pydantic import BaseModel
from typing import List, Optional
from models import FieldTemplate, TemplateField

from embeddings import generate_embedding

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
    template_id: str = Form(""),
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
        embedding = generate_embedding(text)
        print(f"USTVARJEN embedding: {len(embedding)} dimenzij")

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
            embedding=embedding,
            template_id=template_id if template_id else None,
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


class TemplateFieldInput(BaseModel):
    field_key: str
    field_description: str


class TemplateCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    document_type: Optional[str] = None
    fields: List[TemplateFieldInput]


@app.post("/api/templates")
def create_template(
    payload: TemplateCreateRequest,
    db: Session = Depends(get_db)
):
    """Ustvari nov field template iz uporabnikovih trenutnih polj."""
    template = FieldTemplate(
        name=payload.name,
        description=payload.description,
        document_type=payload.document_type,
    )
    db.add(template)
    db.flush()

    for idx, field in enumerate(payload.fields):
        tf = TemplateField(
            template_id=template.id,
            field_key=field.field_key,
            field_description=field.field_description,
            order_index=idx,
        )
        db.add(tf)

    db.commit()
    print(f"USTVARJEN Template: {template.id} ({template.name}) z {len(payload.fields)} polji")

    return {
        "id": str(template.id),
        "name": template.name,
        "field_count": len(payload.fields),
    }


@app.get("/api/templates")
def list_templates(db: Session = Depends(get_db)):
    """Vrne seznam vseh template-ov."""
    templates = db.query(FieldTemplate).order_by(
        FieldTemplate.usage_count.desc(),
        FieldTemplate.created_date.desc()
    ).all()

    result = []
    for t in templates:
        result.append({
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "document_type": t.document_type,
            "created_date": t.created_date.isoformat(),
            "usage_count": t.usage_count,
            "field_count": len(t.template_fields),
        })

    return {"templates": result}


@app.get("/api/templates/{template_id}")
def get_template(template_id: str, db: Session = Depends(get_db)):
    """Vrne en template z vsemi polji."""
    template = db.query(FieldTemplate).filter(
        FieldTemplate.id == template_id
    ).first()

    if not template:
        return {"error": "Template ne obstaja"}

    # Povečaj usage_count - vsako branje je "uporaba"
    # (kasneje lahko premakneš v ločen endpoint /use)
    template.usage_count += 1
    db.commit()

    return {
        "id": str(template.id),
        "name": template.name,
        "description": template.description,
        "document_type": template.document_type,
        "created_date": template.created_date.isoformat(),
        "usage_count": template.usage_count,
        "fields": [
            {
                "key": tf.field_key,
                "description": tf.field_description,
            }
            for tf in template.template_fields
        ],
    }


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db)):
    """Izbriše template. Cascade izbriše tudi vsa template_fields."""
    template = db.query(FieldTemplate).filter(
        FieldTemplate.id == template_id
    ).first()

    if not template:
        return {"error": "Template ne obstaja"}

    db.delete(template)
    db.commit()

    return {"status": "izbrisano"}

@app.post("/api/find-similar")
async def find_similar(
    file: UploadFile = File(...),
    limit: int = Form(5),
    db: Session = Depends(get_db)
):
    """
    Najde top K najbolj podobnih dokumentov za podan PDF.
    Uporablja kosinusno podobnost na embedding-ih (pgvector).

    Vrne tudi template informacije, da lahko frontend predlaga
    isti template kot je bil uporabljen pri podobnih dokumentih.
    """
    # Začasno shrani PDF, ekstrahiraj tekst, generiraj embedding
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        text = extract_text(tmp_path)
        if not text or not text.strip():
            return {"similar_documents": [], "warning": "Dokument nima tekstovne vsebine"}

        query_embedding = generate_embedding(text)
        print(f"FIND-SIMILAR: generiran embedding za {file.filename}")

        # pgvector kosinusna podobnost preko ORM
        # cosine_distance: 0 = identično, 2 = nasprotno
        # similarity = 1 - distance: 1 = identično, 0 = popolnoma drugačno
        results = (
            db.query(
                Document,
                (1 - Document.embedding.cosine_distance(query_embedding)).label("similarity")
            )
            .filter(Document.embedding.is_not(None))
            .order_by(Document.embedding.cosine_distance(query_embedding))
            .limit(limit)
            .all()
        )

        # Sestavi response
        similar = []
        for doc, sim in results:
            # Če je dokument imel template, dodaj info
            template_info = None
            if doc.template_id and doc.template:
                template_info = {
                    "id": str(doc.template.id),
                    "name": doc.template.name,
                    "field_count": len(doc.template.template_fields),
                    "document_type": doc.template.document_type,
                }

            similar.append({
                "id": str(doc.id),
                "filename": doc.filename,
                "upload_date": doc.upload_date.isoformat(),
                "similarity": round(float(sim), 3),
                "template": template_info,
            })

        return {"similar_documents": similar}

    finally:
        os.remove(tmp_path)