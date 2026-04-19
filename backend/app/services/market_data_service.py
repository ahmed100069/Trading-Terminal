from __future__ import annotations

import json
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


class MarketDataService:
    def __init__(self) -> None:
        self._exchange_symbols_cache: list[dict[str, str | bool]] = []
        self._exchange_symbols_cache_updated_at = 0.0
        self._exchange_symbols_cache_ttl_seconds = 900.0

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

        raw_klines = self._get_binance(
            "/api/v3/klines",
            {
                "symbol": normalized_symbol,
                "interval": "1w",
                "limit": min(weeks + 4, 1000),
            },
        )

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        rows: list[dict[str, float | pd.Timestamp]] = []

        for kline in raw_klines:
            close_time_ms = int(kline[6])
            if close_time_ms > now_ms:
                continue

            rows.append(
                {
                    "open_time": pd.to_datetime(int(kline[0]), unit="ms", utc=True).tz_localize(None),
                    "open": float(kline[1]),
                    "high": float(kline[2]),
                    "low": float(kline[3]),
                    "close": float(kline[4]),
                    "volume": float(kline[5]),
                }
            )

        weekly_data = pd.DataFrame(rows)
        if weekly_data.empty:
            raise ValueError(f"No closed weekly Binance candles were returned for symbol '{normalized_symbol}'.")

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

        raw_klines = self._get_binance(
            "/api/v3/uiKlines",
            {
                "symbol": normalized_symbol,
                "interval": interval,
                "limit": min(limit, 1000),
            },
        )
        return [self._to_candle_response(kline) for kline in raw_klines]

    def fetch_market_overview(self, symbol: str) -> MarketOverviewResponse:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            return self._fetch_equity_market_overview(normalized_symbol)

        payload = self._get_binance("/api/v3/ticker/24hr", {"symbol": normalized_symbol})
        return MarketOverviewResponse(
            symbol=payload["symbol"],
            display_name=self._crypto_display_name(payload["symbol"]),
            market="Binance Spot",
            asset_class="crypto",
            last_price=float(payload["lastPrice"]),
            price_change=float(payload["priceChange"]),
            price_change_percent=float(payload["priceChangePercent"]),
            weighted_avg_price=float(payload["weightedAvgPrice"]),
            high_price=float(payload["highPrice"]),
            low_price=float(payload["lowPrice"]),
            volume=float(payload["volume"]),
            quote_volume=float(payload["quoteVolume"]),
            bid_price=float(payload["bidPrice"]),
            ask_price=float(payload["askPrice"]),
            open_time=self._to_datetime(payload["openTime"]),
            close_time=self._to_datetime(payload["closeTime"]),
            trade_count=int(payload["count"]),
        )

    def fetch_watchlist(self, symbols: list[str] | None = None) -> list[WatchlistItemResponse]:
        requested_symbols = [self._normalize_symbol(symbol) for symbol in (symbols or settings.default_watchlist)]
        items_by_symbol: dict[str, WatchlistItemResponse] = {}

        crypto_symbols = [symbol for symbol in requested_symbols if not self._is_indian_equity(symbol)]
        equity_symbols = [symbol for symbol in requested_symbols if self._is_indian_equity(symbol)]

        if crypto_symbols:
            payload = self._get_binance(
                "/api/v3/ticker/24hr",
                {"symbols": json.dumps(crypto_symbols, separators=(",", ":"))},
            )
            for item in payload:
                items_by_symbol[item["symbol"]] = WatchlistItemResponse(
                    symbol=item["symbol"],
                    display_name=self._crypto_display_name(item["symbol"]),
                    market="Binance Spot",
                    asset_class="crypto",
                    last_price=float(item["lastPrice"]),
                    price_change_percent=float(item["priceChangePercent"]),
                    quote_volume=float(item["quoteVolume"]),
                )

        for symbol in equity_symbols:
            overview = self._fetch_equity_market_overview(symbol)
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
            raise ValueError("Order book is only available for Binance crypto pairs in this student project.")

        payload = self._get_binance(
            "/api/v3/depth",
            {
                "symbol": normalized_symbol,
                "limit": min(limit, 100),
            },
        )
        return OrderBookResponse(
            symbol=normalized_symbol,
            last_update_id=int(payload["lastUpdateId"]),
            bids=[self._to_order_book_level(level) for level in payload["bids"]],
            asks=[self._to_order_book_level(level) for level in payload["asks"]],
        )

    def fetch_recent_trades(self, symbol: str, limit: int = 25) -> list[RecentTradeResponse]:
        normalized_symbol = self._normalize_symbol(symbol)
        if self._is_indian_equity(normalized_symbol):
            raise ValueError("Recent trade tape is only available for Binance crypto pairs in this student project.")

        payload = self._get_binance(
            "/api/v3/trades",
            {
                "symbol": normalized_symbol,
                "limit": min(limit, 1000),
            },
        )
        return [
            RecentTradeResponse(
                id=int(item["id"]),
                price=float(item["price"]),
                quantity=float(item["qty"]),
                quote_quantity=float(item["quoteQty"]),
                trade_time=self._to_datetime(item["time"]),
                is_buyer_maker=bool(item["isBuyerMaker"]),
            )
            for item in payload
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
        matching_symbols = [
            item
            for item in self._get_exchange_symbols()
            if query in str(item["symbol"])
            or query in str(item["baseAsset"])
            or query in str(item["quoteAsset"])
        ]
        return [
            AssetSearchResultResponse(
                symbol=str(item["symbol"]),
                display_name=f"{item['baseAsset']} / {item['quoteAsset']}",
                market="Binance Spot",
                asset_class="crypto",
            )
            for item in matching_symbols
        ]

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

    def _get_exchange_symbols(self) -> list[dict[str, str | bool]]:
        cache_is_fresh = time() - self._exchange_symbols_cache_updated_at < self._exchange_symbols_cache_ttl_seconds
        if self._exchange_symbols_cache and cache_is_fresh:
            return self._exchange_symbols_cache

        payload = self._get_binance("/api/v3/exchangeInfo", {})
        symbols = [
            {
                "symbol": item["symbol"],
                "baseAsset": item["baseAsset"],
                "quoteAsset": item["quoteAsset"],
                "status": item["status"],
                "isSpotTradingAllowed": item["isSpotTradingAllowed"],
            }
            for item in payload["symbols"]
            if item.get("status") == "TRADING" and item.get("isSpotTradingAllowed")
        ]

        self._exchange_symbols_cache = symbols
        self._exchange_symbols_cache_updated_at = time()
        return symbols

    def _get_binance(self, path: str, params: dict[str, str | int]) -> list | dict:
        try:
            with httpx.Client(base_url=settings.binance_rest_base_url, timeout=10.0) as client:
                response = client.get(path, params=params)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            error_message = exc.response.text
            try:
                error_message = exc.response.json().get("msg", error_message)
            except ValueError:
                pass
            raise ValueError(f"Binance request failed: {error_message}") from exc
        except httpx.HTTPError as exc:
            raise ValueError("Could not reach Binance market data right now.") from exc

        return response.json()

    def _get_yahoo_chart(self, symbol: str, range_value: str, interval: str) -> dict:
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
        }
        try:
            with httpx.Client(timeout=15.0, headers=headers) as client:
                response = client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                    params={"range": range_value, "interval": interval, "includePrePost": "false"},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ValueError(f"Could not reach the equity market feed for symbol '{symbol}'.") from exc

        payload = response.json()
        error = payload.get("chart", {}).get("error")
        result = payload.get("chart", {}).get("result")
        if error or not result:
            description = error.get("description") if isinstance(error, dict) else None
            raise ValueError(description or f"No equity market data was returned for symbol '{symbol}'.")
        return payload

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
        return "Binance Spot"

    def _crypto_display_name(self, symbol: str) -> str:
        for item in self._get_exchange_symbols():
            if item["symbol"] == symbol:
                return f"{item['baseAsset']} / {item['quoteAsset']}"
        return symbol

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
