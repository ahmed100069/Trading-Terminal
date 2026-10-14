from __future__ import annotations

import os
from dataclasses import dataclass, field


def _split_csv(raw_value: str | None, default: list[str]) -> list[str]:
    if not raw_value:
        return default
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _default_allowed_origins() -> list[str]:
    frontend_port = int(os.getenv("FRONTEND_PORT", "5173"))
    return _split_csv(
        os.getenv("ALLOWED_ORIGINS"),
        [
            f"http://localhost:{frontend_port}",
            f"http://127.0.0.1:{frontend_port}",
            "https://trading-terminal-rouge.vercel.app",
        ],
    )


@dataclass
class Settings:
    project_name: str = os.getenv("PROJECT_NAME", "Trading Terminal")
    api_prefix: str = "/api"
    frontend_port: int = int(os.getenv("FRONTEND_PORT", "5173"))
    backend_port: int = int(os.getenv("BACKEND_PORT", "8000"))
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./trading_platform.db")
    supabase_url: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_publishable_key: str = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    alert_mode: str = os.getenv("ALERT_MODE", "console")
    alert_email_from: str | None = os.getenv("ALERT_EMAIL_FROM")
    alert_email_to: str | None = os.getenv("ALERT_EMAIL_TO")
    smtp_host: str | None = os.getenv("SMTP_HOST")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str | None = os.getenv("SMTP_USERNAME")
    smtp_password: str | None = os.getenv("SMTP_PASSWORD")
    binance_ws_base_url: str = os.getenv("BINANCE_WS_BASE_URL", "wss://data-stream.binance.vision/ws")
    kraken_rest_base_url: str = os.getenv("KRAKEN_REST_BASE_URL", "https://api.kraken.com")
    default_symbol: str = os.getenv("DEFAULT_SYMBOL", "BTCUSDT")
    default_watchlist: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv("DEFAULT_WATCHLIST"),
            [
                "BTCUSDT",
                "ETHUSDT",
                "RELIANCE.NS",
                "TCS.NS",
                "INFY.NS",
                "500325.BO",
            ],
        )
    )
    allowed_origins: list[str] = field(default_factory=_default_allowed_origins)


settings = Settings()
