"""
Migracija za avtentikacijo.
Ustvari users tabelo, doda user_id FK in admin userja.

Admin credentials se preberejo iz okolja (.env):
  ADMIN_EMAIL=...
  ADMIN_PASSWORD=...
"""
import os
from dotenv import load_dotenv
from database import engine, SessionLocal
from sqlalchemy import text
from auth import hash_password

load_dotenv()


def run_migration():
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_email or not admin_password:
        print("NAPAKA: ADMIN_EMAIL in ADMIN_PASSWORD morata biti nastavljena v .env")
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                full_name VARCHAR(200),
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                last_login TIMESTAMP,
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email ON users(email)"))
        print("Tabela 'users' ustvarjena")

        for table in ["documents", "batches", "field_templates"]:
            conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)
            """))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_user_id ON {table}(user_id)"))
            print(f"Tabela '{table}': user_id dodan")

    db = SessionLocal()
    try:
        admin = db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": admin_email}
        ).fetchone()

        if not admin:
            admin_id = db.execute(text("""
                INSERT INTO users (email, hashed_password, full_name, role)
                VALUES (:email, :hash, 'Admin', 'admin')
                RETURNING id
            """), {
                "email": admin_email,
                "hash": hash_password(admin_password),
            }).fetchone()[0]
            print(f"Admin user ustvarjen: {admin_email}")
        else:
            admin_id = admin[0]
            print("Admin user že obstaja")

        for table in ["documents", "batches", "field_templates"]:
            db.execute(text(f"""
                UPDATE {table} SET user_id = :uid WHERE user_id IS NULL
            """), {"uid": str(admin_id)})
            print(f"Tabela '{table}': dodeljen admin")

        db.commit()
        print("\nMigracija uspešna!")
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
