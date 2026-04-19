from __future__ import annotations

import os
from dataclasses import dataclass, field


def _split_csv(raw_value: str | None, default: list[str]) -> list[str]:
    if not raw_value:
        return default
    return [item.strip() for item in raw_value.split(",") if item.strip()]


@dataclass
class Settings:
    project_name: str = os.getenv("PROJECT_NAME", "Weekly Trading Platform")
    api_prefix: str = "/api"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./trading_platform.db")
    alert_mode: str = os.getenv("ALERT_MODE", "console")
    alert_email_from: str | None = os.getenv("ALERT_EMAIL_FROM")
    alert_email_to: str | None = os.getenv("ALERT_EMAIL_TO")
    smtp_host: str | None = os.getenv("SMTP_HOST")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str | None = os.getenv("SMTP_USERNAME")
    smtp_password: str | None = os.getenv("SMTP_PASSWORD")
    binance_rest_base_url: str = os.getenv("BINANCE_REST_BASE_URL", "https://api.binance.com")
    binance_ws_base_url: str = os.getenv("BINANCE_WS_BASE_URL", "wss://data-stream.binance.vision/ws")
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
    allowed_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv("ALLOWED_ORIGINS"),
            [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5175",
                "http://127.0.0.1:5175",
            ],
        )
    )


settings = Settings()
