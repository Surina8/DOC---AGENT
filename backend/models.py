import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean,
    ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from database import Base


# ─────────────────────────────────────────────────────────────
# FIELD TEMPLATES — shranjene predloge polj (Pogodba, Račun, ...)
# ─────────────────────────────────────────────────────────────

class FieldTemplate(Base):
    """
    Shranjen set polj ki ga uporabnik lahko ponovno uporabi.
    Primer: "Pogodba o sodelovanju" template ima polja:
    številka_pogodbe, datum_sklenitve, vrednost_pogodbe, ...
    """
    __tablename__ = "field_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    document_type = Column(String(100), nullable=True)
    # document_type: "contract" | "invoice" | "form" | "other"
    created_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    usage_count = Column(Integer, default=0, nullable=False)

    # Embedding opisa template-a (1536 = OpenAI text-embedding-3-small)
    # Za semantično iskanje "kateri template ustreza temu dokumentu"
    embedding = Column(Vector(1536), nullable=True)

    template_fields = relationship(
        "TemplateField",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="TemplateField.order_index"
    )
    documents = relationship("Document", back_populates="template")
    batches = relationship("Batch", back_populates="template")


class TemplateField(Base):
    """Eno polje znotraj predloge."""
    __tablename__ = "template_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("field_templates.id"),
        nullable=False
    )
    field_key = Column(String(200), nullable=False)
    field_description = Column(Text, nullable=False)
    order_index = Column(Integer, default=0, nullable=False)

    template = relationship("FieldTemplate", back_populates="template_fields")


# ─────────────────────────────────────────────────────────────
# BATCHES — skupinska obdelava več dokumentov
# ─────────────────────────────────────────────────────────────

class Batch(Base):
    """
    Skupina dokumentov obdelanih hkrati z istim template-om.
    Primer: "Pogodbe Q1 2026" — 100 PDF-jev, vsi obdelani z istimi polji.
    """
    __tablename__ = "batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("field_templates.id"),
        nullable=True
    )
    created_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(20), default="processing", nullable=False)
    # status: "processing" | "completed" | "failed"
    total_documents = Column(Integer, default=0, nullable=False)
    completed_documents = Column(Integer, default=0, nullable=False)

    template = relationship("FieldTemplate", back_populates="batches")
    documents = relationship("Document", back_populates="batch")


# ─────────────────────────────────────────────────────────────
# DOCUMENTS — naloženi PDF-ji (razširjeno z RAG funkcionalnostjo)
# ─────────────────────────────────────────────────────────────

class Document(Base):
    """Predstavlja en naložen PDF dokument."""
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(255), nullable=False)
    pdf_path = Column(String(500), nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    total_pages = Column(Integer, nullable=True)
    status = Column(String(20), default="pending", nullable=False)
    # status: "pending" | "reviewed" | "rejected"

    # Cel tekst dokumenta — potreben za similarity search in audit
    document_text = Column(Text, nullable=True)

    # Embedding teksta dokumenta — za semantično iskanje podobnih
    embedding = Column(Vector(1536), nullable=True)

    # Opcijska povezava na batch (NULL = samostojni upload)
    batch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("batches.id"),
        nullable=True
    )

    # Opcijska povezava na uporabljen template
    template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("field_templates.id"),
        nullable=True
    )

    batch = relationship("Batch", back_populates="documents")
    template = relationship("FieldTemplate", back_populates="documents")
    extractions = relationship(
        "Extraction",
        back_populates="document",
        cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────────────────────
# EXTRACTIONS & FIELDS — rezultati LLM ekstrakcije
# ─────────────────────────────────────────────────────────────

class Extraction(Base):
    """En zagon agenta na enem dokumentu."""
    __tablename__ = "extractions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("documents.id"),
        nullable=False
    )
    extraction_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    model_used = Column(String(100), nullable=False)
    avg_confidence = Column(Float, nullable=True)
    raw_llm_response = Column(JSONB, nullable=True)

    # Human review tracking
    confirmed_at = Column(DateTime, nullable=True)
    corrections_count = Column(Integer, default=0, nullable=False)

    document = relationship("Document", back_populates="extractions")
    fields = relationship(
        "Field",
        back_populates="extraction",
        cascade="all, delete-orphan"
    )


class Field(Base):
    """Eno ekstrahirano polje (npr. 'številka_pogodbe' = '2026/0047')."""
    __tablename__ = "fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    extraction_id = Column(
        UUID(as_uuid=True),
        ForeignKey("extractions.id"),
        nullable=False
    )
    field_key = Column(String(200), nullable=False)
    field_value = Column(Text, nullable=True)  # trenutna vrednost (po korekciji ali AI)
    source_text = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0, nullable=False)
    page_number = Column(Integer, nullable=True)
    rectangles = Column(JSONB, nullable=True)

    # Human review tracking
    user_corrected = Column(Boolean, default=False, nullable=False)
    original_value = Column(Text, nullable=True)  # AI-jeva izvirna vrednost pred popravkom

    extraction = relationship("Extraction", back_populates="fields")