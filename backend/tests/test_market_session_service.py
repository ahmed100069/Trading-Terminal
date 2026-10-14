from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.services.market_session_service import get_market_session
from main import app


def test_crypto_session_is_open_around_the_clock() -> None:
    session = get_market_session("BTCUSDT", datetime(2026, 1, 26, 2, 0, tzinfo=timezone.utc))

    assert session.is_open is True
    assert session.status == "OPEN"
    assert session.market == "Crypto, 24/7"


def test_nse_and_bse_open_during_regular_market_hours() -> None:
    market_time = datetime(2026, 10, 8, 4, 30, tzinfo=timezone.utc)

    for symbol in ("RELIANCE.NS", "500325.BO"):
        session = get_market_session(symbol, market_time)
        assert session.is_open is True
        assert session.session_open == datetime(2026, 10, 8, 3, 45, tzinfo=timezone.utc)
        assert session.session_close == datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)


def test_equities_are_closed_on_weekends_and_public_holidays() -> None:
    weekend = datetime(2026, 10, 10, 4, 30, tzinfo=timezone.utc)
    holiday = datetime(2026, 1, 26, 4, 30, tzinfo=timezone.utc)

    for symbol in ("RELIANCE.NS", "500325.BO"):
        assert get_market_session(symbol, weekend).is_open is False
        assert get_market_session(symbol, holiday).is_open is False


def test_equity_session_closes_at_exchange_close_time() -> None:
    close_time = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)

    assert get_market_session("RELIANCE.NS", close_time).is_open is False


def test_market_session_endpoint_returns_exchange_status() -> None:
    response = TestClient(app).get("/api/market/RELIANCE.NS/session")

    assert response.status_code == 200
    assert response.json()["market"] == "NSE"
    assert response.json()["timezone"] == "Asia/Kolkata"