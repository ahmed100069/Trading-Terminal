from datetime import datetime, timezone


def utc_now_naive() -> datetime:
    """Return UTC time without tzinfo for existing timezone-naive database columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
