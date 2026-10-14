from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import pandas_market_calendars as market_calendars

INDIA_TIMEZONE = ZoneInfo("Asia/Kolkata")
UTC = timezone.utc
CALENDAR_BY_SUFFIX = {".NS": "NSE", ".BO": "BSE"}


@dataclass(frozen=True)
class MarketSession:
    symbol: str
    market: str
    asset_class: str
    status: str
    is_open: bool
    timezone: str
    session_open: datetime | None = None
    session_close: datetime | None = None
    next_open: datetime | None = None


@lru_cache(maxsize=2)
def _get_calendar(name: str):
    return market_calendars.get_calendar(name)


def get_market_session(symbol: str, now: datetime | None = None) -> MarketSession:
    normalized_symbol = symbol.upper().strip()
    current_time = now or datetime.now(UTC)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=INDIA_TIMEZONE)
    current_utc = current_time.astimezone(UTC)

    exchange_suffix = next(
        (suffix for suffix in CALENDAR_BY_SUFFIX if normalized_symbol.endswith(suffix)),
        None,
    )
    if exchange_suffix is None:
        return MarketSession(
            symbol=normalized_symbol,
            market="Crypto, 24/7",
            asset_class="crypto",
            status="OPEN",
            is_open=True,
            timezone="UTC",
        )

    market = "NSE" if exchange_suffix == ".NS" else "BSE"
    calendar = _get_calendar(CALENDAR_BY_SUFFIX[exchange_suffix])
    local_today = current_utc.astimezone(INDIA_TIMEZONE).date()
    schedule_end = local_today + timedelta(days=14)
    schedule = calendar.schedule(start_date=local_today, end_date=schedule_end)

    today_open: datetime | None = None
    today_close: datetime | None = None
    next_open: datetime | None = None

    for session_date, session in schedule.iterrows():
        session_open = session["market_open"].to_pydatetime()
        session_close = session["market_close"].to_pydatetime()
        if session_date.date() == local_today:
            today_open = session_open
            today_close = session_close
        if session_open <= current_utc < session_close:
            return MarketSession(
                symbol=normalized_symbol,
                market=market,
                asset_class="equity",
                status="OPEN",
                is_open=True,
                timezone="Asia/Kolkata",
                session_open=session_open,
                session_close=session_close,
            )
        if session_open > current_utc and next_open is None:
            next_open = session_open

    return MarketSession(
        symbol=normalized_symbol,
        market=market,
        asset_class="equity",
        status="CLOSED",
        is_open=False,
        timezone="Asia/Kolkata",
        session_open=today_open,
        session_close=today_close,
        next_open=next_open,
    )


def closed_market_message(session: MarketSession) -> str:
    if session.next_open is None:
        return f"{session.market} is closed."

    next_open_local = session.next_open.astimezone(INDIA_TIMEZONE)
    return (
        f"{session.market} is closed. The next session opens "
        f"{next_open_local:%a, %d %b at %I:%M %p} IST."
    )