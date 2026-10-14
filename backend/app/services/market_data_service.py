from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from time import time

import httpx
import pandas as pd

from app.core.config import settings
from app.schemas.trading import (
    AssetSearchResultResponse,
    CandleResponse,
    MarketOverviewResponse,
    OrderBookLevelResponse,
    OrderBookResponse,
    PriceBar,
    RecentTradeResponse,
    WatchlistItemResponse,
)

INDIAN_EQUITY_CATALOG: list[dict[str, str]] = [
    {"symbol": "RELIANCE.NS", "display_name": "Reliance Industries", "market": "NSE"},
    {"symbol": "TCS.NS", "display_name": "Tata Consultancy Services", "market": "NSE"},
    {"symbol": "INFY.NS", "display_name": "Infosys", "market": "NSE"},
    {"symbol": "HDFCBANK.NS", "display_name": "HDFC Bank", "market": "NSE"},
    {"symbol": "ICICIBANK.NS", "display_name": "ICICI Bank", "market": "NSE"},
    {"symbol": "SBIN.NS", "display_name": "State Bank of India", "market": "NSE"},
    {"symbol": "ITC.NS", "display_name": "ITC", "market": "NSE"},
    {"symbol": "LT.NS", "display_name": "Larsen & Toubro", "market": "NSE"},
    {"symbol": "HINDUNILVR.NS", "display_name": "Hindustan Unilever", "market": "NSE"},
    {"symbol": "BAJFINANCE.NS", "display_name": "Bajaj Finance", "market": "NSE"},
    {"symbol": "500325.BO", "display_name": "Reliance Industries", "market": "BSE"},
    {"symbol": "532540.BO", "display_name": "Tata Consultancy Services", "market": "BSE"},
    {"symbol": "500209.BO", "display_name": "Infosys", "market": "BSE"},
    {"symbol": "500180.BO", "display_name": "HDFC Bank", "market": "BSE"},
    {"symbol": "532174.BO", "display_name": "ICICI Bank", "market": "BSE"},
    {"symbol": "500112.BO", "display_name": "State Bank of India", "market": "BSE"},
]

YAHOO_EQUITY_SYMBOL_ALIASES = {
    "500325.BO": "RELIANCE.BO",
    "532540.BO": "TCS.BO",
    "500209.BO": "INFY.BO",
    "500180.BO": "HDFCBANK.BO",
    "532174.BO": "ICICIBANK.BO",
    "500112.BO": "SBIN.BO",
}

# Reuse keep-alive connections across requests. Creating a new client for every
# provider call repeats DNS, TCP, and TLS setup on the latency-critical path.
_PROVIDER_TIMEOUT = httpx.Timeout(12.0, connect=3.0)
_KRAKEN_CLIENT = httpx.Client(
    base_url=settings.kraken_rest_base_url,
    timeout=_PROVIDER_TIMEOUT,
    limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
)
_YAHOO_CLIENT = httpx.Client(
    timeout=_PROVIDER_TIMEOUT,
    follow_redirects=True,
    headers={"User-Agent": "Mozilla/5.0 (compatible; TradingPlatform/1.0)"},
    limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
)


class MarketDataService:
    def __init__(self) -> None:
        self._kraken_cache: dict[str, tuple[float, dict]] = {}
        self._yahoo_cache: dict[str, tuple[float, dict]] = {}
        self._kraken_pairs_by_altname: dict[str, tuple[str, dict]] = {}
        self._kraken_pairs_updated_at = 0.0

    def fetch_weekly_bars(self, symbol: str, weeks: int = 156) -> pd.DataFrame:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            history = self._fetch_equity_history(normalized_symbol, interval="1wk", limit=weeks + 4)
            weekly_data = history[["open_time", "open", "high", "low", "close", "volume"]].copy()
            weekly_data["open_time"] = pd.to_datetime(weekly_data["open_time"], utc=True).dt.tz_localize(None)
            weekly_data = weekly_data.set_index("open_time").tail(weeks)
            if weekly_data.empty:
                raise ValueError(f"No weekly data was returned for symbol '{normalized_symbol}'.")
            return weekly_data

        ohlc = self._fetch_kraken_ohlc(normalized_symbol, interval=10080)
        weekly_data = self._ohlc_frame(ohlc)
        if weekly_data.empty:
            raise ValueError(f"No closed weekly Kraken candles were returned for symbol '{normalized_symbol}'.")

        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        weekly_data = weekly_data[weekly_data["open_time"] + timedelta(days=7) <= now_utc]
        weekly_data = weekly_data.set_index("open_time").tail(weeks)
        return weekly_data

    def fetch_candles(self, symbol: str, interval: str, limit: int = 300) -> list[CandleResponse]:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            history = self._fetch_equity_history(normalized_symbol, interval=interval, limit=limit)
            return [
                CandleResponse(
                    open_time=row.open_time.to_pydatetime(),
                    close_time=row.close_time.to_pydatetime(),
                    open=float(row.open),
                    high=float(row.high),
                    low=float(row.low),
                    close=float(row.close),
                    volume=float(row.volume),
                    quote_volume=float(row.volume * row.close),
                    trade_count=0,
                    is_closed=row.close_time <= datetime.now(timezone.utc),
                )
                for row in history.tail(limit).itertuples(index=False)
            ]

        kraken_interval = self._kraken_interval(interval)
        rows = self._fetch_kraken_ohlc(normalized_symbol, interval=kraken_interval)
        candles = []
        for row in rows[-min(limit, 720):]:
            open_time = self._to_datetime(int(float(row[0]) * 1000))
            close_time = open_time + self._interval_delta(interval)
            candles.append(CandleResponse(
                open_time=open_time,
                close_time=close_time,
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[6]),
                quote_volume=float(row[4]) * float(row[6]),
                trade_count=int(row[7]),
                is_closed=close_time <= datetime.now(timezone.utc),
            ))
        return candles

    def fetch_market_overview(self, symbol: str) -> MarketOverviewResponse:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            return self._fetch_equity_market_overview(normalized_symbol)

        ticker = self._fetch_kraken_ticker(normalized_symbol)
        last_price = float(ticker["c"][0])
        open_price = float(ticker["o"])
        return MarketOverviewResponse(
            symbol=normalized_symbol,
            display_name=self._crypto_display_name(normalized_symbol),
            market="Kraken Spot",
            asset_class="crypto",
            last_price=last_price,
            price_change=last_price - open_price,
            price_change_percent=((last_price - open_price) / open_price * 100) if open_price else 0.0,
            weighted_avg_price=float(ticker["p"][1]),
            high_price=float(ticker["h"][1]),
            low_price=float(ticker["l"][1]),
            volume=float(ticker["v"][1]),
            quote_volume=float(ticker["v"][1]) * last_price,
            bid_price=float(ticker["b"][0]),
            ask_price=float(ticker["a"][0]),
            open_time=datetime.now(timezone.utc) - timedelta(hours=24),
            close_time=datetime.now(timezone.utc),
            trade_count=int(ticker["t"][1]),
        )

    def fetch_watchlist(self, symbols: list[str] | None = None) -> list[WatchlistItemResponse]:
        requested_symbols = [self._normalize_symbol(symbol) for symbol in (symbols or settings.default_watchlist)]
        items_by_symbol: dict[str, WatchlistItemResponse] = {}

        crypto_symbols = [symbol for symbol in requested_symbols if not self._is_indian_equity(symbol)]
        equity_symbols = [symbol for symbol in requested_symbols if self._is_indian_equity(symbol)]

        if crypto_symbols:
            pair_ids_by_symbol = {
                symbol: self._kraken_pair_id(self._kraken_pair_altname(symbol))
                for symbol in crypto_symbols
            }
            payload = self._get_kraken("/0/public/Ticker", {
                "pair": ",".join(dict.fromkeys(pair_ids_by_symbol.values())),
            })
            for symbol, pair_id in pair_ids_by_symbol.items():
                ticker = payload["result"].get(pair_id)
                if ticker is None:
                    continue
                last_price = float(ticker["c"][0])
                items_by_symbol[symbol] = WatchlistItemResponse(
                    symbol=symbol,
                    display_name=self._crypto_display_name(symbol),
                    market="Kraken Spot",
                    asset_class="crypto",
                    last_price=last_price,
                    price_change_percent=((last_price - float(ticker["o"])) / float(ticker["o"]) * 100) if float(ticker["o"]) else 0.0,
                    quote_volume=float(ticker["v"][1]) * last_price,
                )

        # Yahoo is a separate upstream request per equity; fetch independently
        # in parallel while preserving the requested output order below.
        with ThreadPoolExecutor(max_workers=min(6, len(equity_symbols) or 1)) as pool:
            equity_overviews = list(pool.map(self._fetch_equity_market_overview, equity_symbols))
        for symbol, overview in zip(equity_symbols, equity_overviews):
            items_by_symbol[symbol] = WatchlistItemResponse(
                symbol=overview.symbol,
                display_name=overview.display_name,
                market=overview.market,
                asset_class=overview.asset_class,
                last_price=overview.last_price,
                price_change_percent=overview.price_change_percent,
                quote_volume=overview.quote_volume,
            )

        return [items_by_symbol[symbol] for symbol in requested_symbols if symbol in items_by_symbol]

    def search_assets(self, query: str, limit: int = 8) -> list[AssetSearchResultResponse]:
        normalized_query = query.upper().strip()
        if len(normalized_query) < 2:
            return []

        results = self._search_crypto_assets(normalized_query) + self._search_indian_equities(normalized_query)
        results.sort(
            key=lambda item: (
                not item.symbol.startswith(normalized_query),
                not item.display_name.upper().startswith(normalized_query),
                item.asset_class != "equity",
                item.symbol,
            )
        )
        return results[:limit]

    def fetch_order_book(self, symbol: str, limit: int = 12) -> OrderBookResponse:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            raise ValueError("Order book is only available for crypto pairs in this project.")

        pair = self._kraken_pair_altname(normalized_symbol)
        pair_id = self._kraken_pair_id(pair)
        payload = self._get_kraken("/0/public/Depth", {"pair": pair, "count": min(limit, 100)})
        book = payload["result"][pair_id]
        return OrderBookResponse(
            symbol=normalized_symbol,
            last_update_id=int(time() * 1000),
            bids=[OrderBookLevelResponse(price=float(level[0]), quantity=float(level[1])) for level in book["bids"]],
            asks=[OrderBookLevelResponse(price=float(level[0]), quantity=float(level[1])) for level in book["asks"]],
        )

    def fetch_recent_trades(self, symbol: str, limit: int = 25) -> list[RecentTradeResponse]:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            raise ValueError("Recent trade tape is only available for crypto pairs in this project.")

        pair = self._kraken_pair_altname(normalized_symbol)
        pair_id = self._kraken_pair_id(pair)
        payload = self._get_kraken("/0/public/Trades", {"pair": pair})
        rows = payload["result"][pair_id][-min(limit, 1000):]
        return [
            RecentTradeResponse(
                id=int(float(item[2]) * 1000) + index,
                price=float(item[0]),
                quantity=float(item[1]),
                quote_quantity=float(item[0]) * float(item[1]),
                trade_time=datetime.fromtimestamp(float(item[2]), tz=timezone.utc),
                is_buyer_maker=item[3] == "s",
            )
            for index, item in enumerate(rows)
        ]

    def to_price_bars(self, price_data: pd.DataFrame) -> list[PriceBar]:
        return [
            PriceBar(
                date=index.date(),
                open=round(float(row["open"]), 4),
                high=round(float(row["high"]), 4),
                low=round(float(row["low"]), 4),
                close=round(float(row["close"]), 4),
                volume=float(row["volume"]),
            )
            for index, row in price_data.iterrows()
        ]

    def _fetch_equity_market_overview(self, symbol: str) -> MarketOverviewResponse:
        payload = self._get_yahoo_chart(symbol=symbol, range_value="1mo", interval="1d")
        result = payload["chart"]["result"][0]
        meta = result["meta"]
        history = self._history_from_yahoo_result(result, "1d")
        if history.empty:
            raise ValueError(f"No market data was returned for symbol '{symbol}'.")

        last_row = history.iloc[-1]
        previous_close = float(meta.get("previousClose") or history.iloc[-2]["close"] if len(history) > 1 else last_row["close"])
        last_price = float(meta.get("regularMarketPrice") or last_row["close"])
        price_change = last_price - previous_close
        price_change_percent = (price_change / previous_close * 100) if previous_close else 0.0
        market_time = datetime.fromtimestamp(int(meta.get("regularMarketTime", int(time()))), tz=timezone.utc)

        return MarketOverviewResponse(
            symbol=symbol,
            display_name=str(meta.get("longName") or self._display_name_for_equity(symbol)),
            market=self._market_label_for_symbol(symbol),
            asset_class="equity",
            last_price=last_price,
            price_change=price_change,
            price_change_percent=price_change_percent,
            weighted_avg_price=float(meta.get("regularMarketPrice") or last_row["close"]),
            high_price=float(meta.get("regularMarketDayHigh") or last_row["high"]),
            low_price=float(meta.get("regularMarketDayLow") or last_row["low"]),
            volume=float(meta.get("regularMarketVolume") or last_row["volume"]),
            quote_volume=float((meta.get("regularMarketVolume") or last_row["volume"]) * last_price),
            bid_price=last_price,
            ask_price=last_price,
            open_time=market_time,
            close_time=market_time,
            trade_count=0,
        )

    def _fetch_equity_history(self, symbol: str, interval: str, limit: int) -> pd.DataFrame:
        yahoo_interval = interval
        if interval == "4h":
            yahoo_interval = "1h"

        payload = self._get_yahoo_chart(
            symbol=symbol,
            range_value=self._history_range_for_interval(interval, limit),
            interval=yahoo_interval,
        )
        result = payload["chart"]["result"][0]
        history = self._history_from_yahoo_result(result, yahoo_interval)
        if history.empty:
            raise ValueError(f"No market data was returned for symbol '{symbol}'.")

        if interval == "4h":
            history = self._resample_history_to_four_hours(history)

        return history.tail(limit)

    def _history_from_yahoo_result(self, result: dict, interval: str) -> pd.DataFrame:
        timestamps = result.get("timestamp") or []
        quote = (result.get("indicators") or {}).get("quote", [{}])[0]
        rows: list[dict[str, object]] = []

        for index, timestamp in enumerate(timestamps):
            open_price = self._series_value(quote.get("open"), index)
            high_price = self._series_value(quote.get("high"), index)
            low_price = self._series_value(quote.get("low"), index)
            close_price = self._series_value(quote.get("close"), index)
            volume = self._series_value(quote.get("volume"), index, default=0)
            if None in {open_price, high_price, low_price, close_price}:
                continue

            open_time = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
            rows.append(
                {
                    "open_time": open_time,
                    "close_time": open_time + self._close_delta_for_interval(interval),
                    "open": float(open_price),
                    "high": float(high_price),
                    "low": float(low_price),
                    "close": float(close_price),
                    "volume": float(volume or 0),
                }
            )

        return pd.DataFrame(rows)

    def _resample_history_to_four_hours(self, history: pd.DataFrame) -> pd.DataFrame:
        frame = history.copy().set_index("open_time")
        resampled = frame.resample("4h").agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        ).dropna()
        resampled = resampled.reset_index()
        resampled["close_time"] = resampled["open_time"] + timedelta(hours=4)
        return resampled[["open_time", "close_time", "open", "high", "low", "close", "volume"]]

    def _history_range_for_interval(self, interval: str, limit: int) -> str:
        if interval == "1m":
            return "7d"
        if interval == "5m":
            return "1mo"
        if interval == "15m":
            return "3mo"
        if interval in {"1h", "4h"}:
            return "2y"
        if interval == "1wk":
            return "5y"
        return "5y" if limit > 365 else "1y"

    def _close_delta_for_interval(self, interval: str) -> timedelta:
        if interval == "1m":
            return timedelta(minutes=1)
        if interval == "5m":
            return timedelta(minutes=5)
        if interval == "15m":
            return timedelta(minutes=15)
        if interval in {"1h", "60m"}:
            return timedelta(hours=1)
        if interval == "4h":
            return timedelta(hours=4)
        if interval == "1wk":
            return timedelta(days=7)
        return timedelta(days=1)

    def _search_crypto_assets(self, query: str) -> list[AssetSearchResultResponse]:
        results = []
        for _, pair_info in self._get_kraken_pairs().values():
            wsname = str(pair_info.get("wsname") or "")
            if "/" not in wsname or not wsname.endswith("/USD"):
                continue
            base = self._kraken_base_name(wsname.split("/", 1)[0])
            app_symbol = f"{base}USDT"
            display_name = f"{base} / USDT"
            if query in app_symbol or query in base or query in display_name.upper():
                results.append(AssetSearchResultResponse(
                    symbol=app_symbol,
                    display_name=display_name,
                    market="Kraken Spot (USD quote)",
                    asset_class="crypto",
                ))
        return results

    def _search_indian_equities(self, query: str) -> list[AssetSearchResultResponse]:
        matches = [
            item
            for item in INDIAN_EQUITY_CATALOG
            if query in item["symbol"].upper() or query in item["display_name"].upper()
        ]
        return [
            AssetSearchResultResponse(
                symbol=item["symbol"],
                display_name=item["display_name"],
                market=item["market"],
                asset_class="equity",
            )
            for item in matches
        ]

    def _get_kraken_pairs(self) -> dict[str, tuple[str, dict]]:
        if self._kraken_pairs_by_altname and time() - self._kraken_pairs_updated_at < 3600:
            return self._kraken_pairs_by_altname

        payload = self._get_kraken("/0/public/AssetPairs", {})
        self._kraken_pairs_by_altname = {
            str(pair.get("altname", pair_id)): (pair_id, pair)
            for pair_id, pair in payload["result"].items()
            if isinstance(pair, dict)
        }
        self._kraken_pairs_updated_at = time()
        return self._kraken_pairs_by_altname

    def _kraken_pair_altname(self, symbol: str) -> str:
        quote = next((item for item in ("USDT", "USDC", "BUSD", "USD") if symbol.endswith(item)), None)
        if not quote:
            raise ValueError(f"Kraken does not support the quote currency for '{symbol}'.")
        base = symbol[:-len(quote)]
        base = {"BTC": "XBT", "DOGE": "XDG"}.get(base, base)
        return f"{base}USD"

    def _kraken_pair_id(self, altname: str) -> str:
        pair = self._get_kraken_pairs().get(altname)
        if not pair:
            raise ValueError(f"Kraken does not provide a USD market for '{altname}'.")
        return pair[0]

    def _kraken_base_name(self, base: str) -> str:
        return {"XBT": "BTC", "XXBT": "BTC", "XDG": "DOGE", "XXDG": "DOGE"}.get(base, base)

    def _fetch_kraken_ticker(self, symbol: str) -> dict:
        pair = self._kraken_pair_altname(symbol)
        pair_id = self._kraken_pair_id(pair)
        payload = self._get_kraken("/0/public/Ticker", {"pair": pair})
        return payload["result"][pair_id]

    def _fetch_kraken_ohlc(self, symbol: str, interval: int) -> list[list]:
        pair = self._kraken_pair_altname(symbol)
        pair_id = self._kraken_pair_id(pair)
        payload = self._get_kraken("/0/public/OHLC", {"pair": pair, "interval": interval})
        return payload["result"][pair_id]

    def _ohlc_frame(self, rows: list[list]) -> pd.DataFrame:
        return pd.DataFrame([
            {
                "open_time": datetime.fromtimestamp(float(row[0]), tz=timezone.utc).replace(tzinfo=None),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[6]),
            }
            for row in rows
        ])

    def _kraken_interval(self, interval: str) -> int:
        intervals = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440, "1w": 10080}
        try:
            return intervals[interval]
        except KeyError as exc:
            raise ValueError(f"Kraken does not support the '{interval}' candle interval.") from exc

    def _interval_delta(self, interval: str) -> timedelta:
        return {
            "1m": timedelta(minutes=1),
            "5m": timedelta(minutes=5),
            "15m": timedelta(minutes=15),
            "1h": timedelta(hours=1),
            "4h": timedelta(hours=4),
            "1d": timedelta(days=1),
            "1w": timedelta(days=7),
        }[interval]

    def _get_kraken(self, path: str, params: dict[str, str | int]) -> dict:
        cache_key = f"{path}?{httpx.QueryParams(params)}"
        cached = self._kraken_cache.get(cache_key)
        ttl = 3600.0 if path.endswith("/AssetPairs") else 5.0 if path.endswith("/Ticker") else 15.0 if path.endswith("/OHLC") else 3.0
        if cached and time() - cached[0] < ttl:
            return cached[1]

        try:
            response = _KRAKEN_CLIENT.get(path, params=params)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise ValueError("Could not reach Kraken market data right now.") from exc

        errors = payload.get("error") or []
        if errors:
            raise ValueError(f"Kraken market-data request failed: {', '.join(errors)}")
        self._kraken_cache[cache_key] = (time(), payload)
        if len(self._kraken_cache) > 256:
            self._kraken_cache = {key: value for key, value in self._kraken_cache.items() if time() - value[0] < 3600}
        return payload

    def _get_yahoo_chart(self, symbol: str, range_value: str, interval: str) -> dict:
        """Fetch chart data from Yahoo Finance's chart endpoint."""
        yahoo_symbol = YAHOO_EQUITY_SYMBOL_ALIASES.get(symbol, symbol)
        cache_key = f"{yahoo_symbol}:{range_value}:{interval}"
        cached = self._yahoo_cache.get(cache_key)
        cache_ttl = 15.0 if interval in {"1m", "5m", "15m"} else 60.0 if interval in {"1h", "1d"} else 300.0
        if cached and time() - cached[0] < cache_ttl:
            return cached[1]
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}"
        last_error: Exception | None = None

        for attempt in range(2):
            try:
                response = _YAHOO_CLIENT.get(
                    url,
                    params={"range": range_value, "interval": interval},
                )
                response.raise_for_status()
                payload = response.json()

                chart = payload.get("chart") or {}
                if chart.get("error"):
                    raise ValueError(str(chart["error"].get("description") or chart["error"]))
                if not chart.get("result"):
                    raise ValueError(f"No equity market data was returned for symbol '{symbol}'.")
                self._yahoo_cache[cache_key] = (time(), payload)
                if len(self._yahoo_cache) > 256:
                    self._yahoo_cache = {
                        key: value for key, value in self._yahoo_cache.items()
                        if time() - value[0] < 3600
                    }
                return payload
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt == 1:
                    break

        raise ValueError(f"Could not reach the equity market feed for symbol '{symbol}'.") from last_error

    def _normalize_symbol(self, symbol: str) -> str:
        normalized_symbol = symbol.upper().strip()
        if not normalized_symbol or any(character not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789." for character in normalized_symbol):
            raise ValueError("Use a valid symbol such as BTCUSDT, RELIANCE.NS, or 500325.BO.")
        return normalized_symbol

    def _is_indian_equity(self, symbol: str) -> bool:
        return symbol.endswith(".NS") or symbol.endswith(".BO")

    def _display_name_for_equity(self, symbol: str) -> str:
        for item in INDIAN_EQUITY_CATALOG:
            if item["symbol"] == symbol:
                return item["display_name"]
        return symbol

    def _market_label_for_symbol(self, symbol: str) -> str:
        if symbol.endswith(".NS"):
            return "NSE"
        if symbol.endswith(".BO"):
            return "BSE"
        return "Kraken Spot"

    def _crypto_display_name(self, symbol: str) -> str:
        pair = self._kraken_pair_altname(symbol)
        base = self._kraken_base_name(pair[:-3])
        return f"{base} / USD"

    def _series_value(self, series: list | None, index: int, default: float | None = None) -> float | None:
        if not series or index >= len(series):
            return default
        value = series[index]
        return default if value is None else float(value)

    def _to_candle_response(self, kline: list[str | int]) -> CandleResponse:
        return CandleResponse(
            open_time=self._to_datetime(kline[0]),
            close_time=self._to_datetime(kline[6]),
            open=float(kline[1]),
            high=float(kline[2]),
            low=float(kline[3]),
            close=float(kline[4]),
            volume=float(kline[5]),
            quote_volume=float(kline[7]),
            trade_count=int(kline[8]),
            is_closed=self._to_datetime(kline[6]) <= datetime.now(timezone.utc),
        )

    def _to_order_book_level(self, level: list[str]) -> OrderBookLevelResponse:
        return OrderBookLevelResponse(price=float(level[0]), quantity=float(level[1]))

    def _to_datetime(self, timestamp_ms: int | str) -> datetime:
        return datetime.fromtimestamp(int(timestamp_ms) / 1000, tz=timezone.utc)
