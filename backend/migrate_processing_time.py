"""
Doda processing_duration_ms kolono v extractions tabelo.
"""
from database import engine
from sqlalchemy import text


with engine.begin() as conn:
    conn.execute(text("""
        ALTER TABLE extractions
        ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER
    """))
    print("Kolona 'processing_duration_ms' dodana")

print("Migracija uspešna!")
