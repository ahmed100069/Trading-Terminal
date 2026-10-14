from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

sqlite_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    connect_args=sqlite_connect_args,
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
