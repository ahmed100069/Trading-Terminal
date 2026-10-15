from __future__ import annotations

from collections.abc import Generator
import os

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

if os.getenv("RENDER") and settings.database_url.startswith("sqlite"):
    raise RuntimeError(
        "Render must use a persistent PostgreSQL DATABASE_URL. Configure the Supabase "
        "PostgreSQL connection string in the trading-terminal-backend service."
    )

database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = "postgresql+psycopg://" + database_url.removeprefix("postgres://")
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url.removeprefix("postgresql://")

sqlite_connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

engine = create_engine(
    database_url,
    connect_args=sqlite_connect_args,
    pool_pre_ping=True,
    future=True,
)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)
Base = declarative_base()


def create_database() -> None:
    Base.metadata.create_all(bind=engine)
    required_columns = {
        "paper_positions": {
            "user_id": "VARCHAR(255)",
            "risk_budget_amount": "FLOAT",
        },
        "alert_events": {"user_id": "VARCHAR(255)"},
    }
    for table_name, columns in required_columns.items():
        existing_columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
        with engine.begin() as connection:
            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
                    )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
