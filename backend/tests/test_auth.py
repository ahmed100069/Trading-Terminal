from __future__ import annotations

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
import pytest

from app.core import auth
from app.core.config import settings
from main import app


def test_auth_rejects_missing_bearer_token() -> None:
    try:
        auth.require_authenticated_user(None)
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("Missing bearer token should be rejected.")


def test_auth_returns_user_from_supabase_verification(monkeypatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(settings, "supabase_publishable_key", "sb_publishable_test")

    class Response:
        status_code = 200

        @staticmethod
        def json() -> dict[str, str]:
            return {"id": "user-123", "email": "person@example.com"}

    def fake_get(url: str, headers: dict[str, str], timeout: float) -> Response:
        assert url == "https://project.supabase.co/auth/v1/user"
        assert headers["Authorization"] == "Bearer valid-access-token"
        assert headers["apikey"] == "sb_publishable_test"
        assert timeout == 10.0
        return Response()

    monkeypatch.setattr(auth.httpx, "get", fake_get)
    user = auth.require_authenticated_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-access-token")
    )

    assert user.id == "user-123"
    assert user.email == "person@example.com"


def test_auth_fails_closed_without_backend_configuration(monkeypatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_publishable_key", "")

    try:
        auth.require_authenticated_user(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-access-token")
        )
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("Auth should fail closed when backend configuration is missing.")


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/dashboard/summary", None),
        ("get", "/api/paper-trading/positions", None),
        ("get", "/api/paper-trading/trades", None),
        ("get", "/api/paper-trading/alerts", None),
        ("post", "/api/paper-trading/manual", {"symbol": "BTCUSDT", "strategy": "momentum", "action": "BUY", "quantity": 1}),
        ("post", "/api/paper-trading/sync", {"symbols": ["BTCUSDT"], "strategy": "momentum"}),
    ],
)
def test_protected_apis_reject_anonymous_requests(method: str, path: str, payload: dict | None) -> None:
    client = TestClient(app)
    response = client.get(path) if method == "get" else client.post(path, json=payload)
    assert response.status_code == 401