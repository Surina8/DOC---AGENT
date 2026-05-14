"""
Inicializacijski skript za bazo:
1. Aktivira pgvector razširitev (CREATE EXTENSION vector)
2. Ustvari vse tabele iz models.py

Zaženi enkrat na začetku ali po vsaki spremembi modelov.
"""

from sqlalchemy import text
from database import engine, Base

# Pomembno: uvozi modele PRED create_all
# da jih Base.metadata "vidi"
import models  # noqa: F401


def init_database():
    print("Aktiviram pgvector razširitev...")
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        conn.commit()
    print("pgvector aktiviran.")

    print("Ustvarjam tabele...")
    Base.metadata.create_all(bind=engine)
    print("Tabele ustvarjene.")

    # Izpiši seznam ustvarjenih tabel
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
        ))
        tables = [row[0] for row in result]
        print(f"\nTabele v bazi ({len(tables)}):")
        for t in tables:
            print(f"  - {t}")


if __name__ == "__main__":
    init_database()