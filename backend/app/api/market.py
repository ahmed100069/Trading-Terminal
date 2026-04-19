from fastapi import APIRouter, HTTPException, Query

from app.schemas.trading import (
    AssetSearchResultResponse,
    CandleResponse,
    MarketInterval,
    MarketOverviewResponse,
    OrderBookResponse,
    PriceBar,
    RecentTradeResponse,
    WatchlistItemResponse,
)
from app.services.market_data_service import MarketDataService

router = APIRouter()
market_data_service = MarketDataService()


@router.get("/watchlist", response_model=list[WatchlistItemResponse])
def get_watchlist(symbols: str | None = Query(default=None)) -> list[WatchlistItemResponse]:
    try:
        requested_symbols = [item.strip().upper() for item in symbols.split(",")] if symbols else None
        return market_data_service.fetch_watchlist(requested_symbols)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/search", response_model=list[AssetSearchResultResponse])
def search_assets(
    query: str = Query(..., min_length=2, max_length=20),
    limit: int = Query(default=8, ge=1, le=20),
) -> list[AssetSearchResultResponse]:
    try:
        return market_data_service.search_assets(query=query, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{symbol}/overview", response_model=MarketOverviewResponse)
def get_market_overview(symbol: str) -> MarketOverviewResponse:
    try:
        return market_data_service.fetch_market_overview(symbol)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{symbol}/candles", response_model=list[CandleResponse])
def get_candles(
    symbol: str,
    interval: MarketInterval = Query(default=MarketInterval.one_minute),
    limit: int = Query(default=300, ge=50, le=1000),
) -> list[CandleResponse]:
    try:
        return market_data_service.fetch_candles(symbol=symbol, interval=interval.value, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{symbol}/depth", response_model=OrderBookResponse)
def get_order_book(
    symbol: str,
    limit: int = Query(default=12, ge=5, le=100),
) -> OrderBookResponse:
    try:
        return market_data_service.fetch_order_book(symbol=symbol, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{symbol}/recent-trades", response_model=list[RecentTradeResponse])
def get_recent_trades(
    symbol: str,
    limit: int = Query(default=25, ge=10, le=200),
) -> list[RecentTradeResponse]:
    try:
        return market_data_service.fetch_recent_trades(symbol=symbol, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{symbol}/weekly-bars", response_model=list[PriceBar])
def get_weekly_bars(
    symbol: str,
    weeks: int = Query(default=52, ge=12, le=260),
) -> list[PriceBar]:
    try:
        price_data = market_data_service.fetch_weekly_bars(symbol=symbol, weeks=weeks)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return market_data_service.to_price_bars(price_data)
