import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL ni nastavljen v .env datoteki!")

# Engine — povezava na bazo
engine = create_engine(DATABASE_URL, echo=False)

# Session factory — vsaka HTTP zahteva dobi svojo sejo
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base — vsi modeli (tabele) bodo dedovali iz tega
Base = declarative_base()


def get_db():
    """
    FastAPI dependency — odpre sejo za zahtevo, jo zapre na koncu.
    Uporaba v endpointih: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()