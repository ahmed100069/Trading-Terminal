from __future__ import annotations

from sqlalchemy import create_engine, inspect, text

from app.core import database


def test_ownership_migration_preserves_existing_unowned_rows(monkeypatch, tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE paper_positions (id INTEGER PRIMARY KEY)")
        connection.exec_driver_sql("CREATE TABLE alert_events (id INTEGER PRIMARY KEY)")
        connection.exec_driver_sql("INSERT INTO paper_positions (id) VALUES (7)")
        connection.exec_driver_sql("INSERT INTO alert_events (id) VALUES (9)")

    monkeypatch.setattr(database, "engine", engine)
    database.create_database()

    position_columns = {column["name"] for column in inspect(engine).get_columns("paper_positions")}
    assert "user_id" in position_columns
    assert "risk_budget_amount" in position_columns
    assert "user_id" in {column["name"] for column in inspect(engine).get_columns("alert_events")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT id, user_id, risk_budget_amount FROM paper_positions WHERE id = 7")).one() == (7, None, None)
        assert connection.execute(text("SELECT id, user_id FROM alert_events WHERE id = 9")).one() == (9, None)

    engine.dispose()