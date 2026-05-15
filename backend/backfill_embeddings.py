"""
Backfill skript za embedding-e.
Najde vse dokumente brez embedding-a in jih posodobi z novimi.
"""

from sqlalchemy import or_
from database import SessionLocal
from models import Document
from embeddings import generate_embedding


def backfill():
    db = SessionLocal()
    try:
        # Najdi dokumente brez embedding-a
        # NULL preveritev za pgvector zahteva eksplicitno: embedding IS NULL
        docs_to_update = db.query(Document).filter(
            Document.embedding.is_(None)
        ).all()

        if not docs_to_update:
            print("Vsi dokumenti že imajo embedding. Nič za backfill.")
            return

        total = len(docs_to_update)
        print(f"Najdeno {total} dokumentov brez embedding-a.\n")

        success = 0
        failed = 0

        for i, doc in enumerate(docs_to_update, 1):
            print(f"[{i}/{total}] {doc.filename}...", end=" ", flush=True)

            if not doc.document_text:
                print("PRESKOČENO (manjka document_text)")
                failed += 1
                continue

            try:
                embedding = generate_embedding(doc.document_text)
                doc.embedding = embedding
                db.commit()
                print(f"OK ({len(embedding)} dim)")
                success += 1
            except Exception as e:
                db.rollback()
                print(f"NAPAKA: {e}")
                failed += 1

        print(f"\nKončano: {success} uspešnih, {failed} napak.")

    finally:
        db.close()


if __name__ == "__main__":
    backfill()