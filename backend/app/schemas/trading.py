from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class StrategyName(str, Enum):
    moving_average = "moving_average"
    rsi = "rsi"
    momentum = "momentum"


class ManualTradeAction(str, Enum):
    buy = "BUY"
    sell = "SELL"
    close = "CLOSE"


class MarketInterval(str, Enum):
    one_minute = "1m"
    five_minutes = "5m"
    fifteen_minutes = "15m"
    one_hour = "1h"
    four_hours = "4h"
    one_day = "1d"
    one_week = "1w"


class PriceBar(BaseModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandleResponse(BaseModel):
    open_time: datetime
    close_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float
    trade_count: int
    is_closed: bool


class MarketOverviewResponse(BaseModel):
    symbol: str
    display_name: str | None = None
    market: str
    asset_class: str
    last_price: float
    price_change: float
    price_change_percent: float
    weighted_avg_price: float
    high_price: float
    low_price: float
    volume: float
    quote_volume: float
    bid_price: float
    ask_price: float
    open_time: datetime
    close_time: datetime
    trade_count: int


class WatchlistItemResponse(BaseModel):
    symbol: str
    display_name: str | None = None
    market: str
    asset_class: str
    last_price: float
    price_change_percent: float
    quote_volume: float


class AssetSearchResultResponse(BaseModel):
    symbol: str
    display_name: str
    market: str
    asset_class: str


class OrderBookLevelResponse(BaseModel):
    price: float
    quantity: float


class OrderBookResponse(BaseModel):
    symbol: str
    last_update_id: int
    bids: list[OrderBookLevelResponse]
    asks: list[OrderBookLevelResponse]


class RecentTradeResponse(BaseModel):
    id: int
    price: float
    quantity: float
    quote_quantity: float
    trade_time: datetime
    is_buyer_maker: bool


class StrategyDefinition(BaseModel):
    name: StrategyName
    label: str
    description: str
    default_parameters: dict[str, float]


class BacktestRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    strategy: StrategyName
    weeks: int = Field(default=156, ge=26, le=260)
    initial_cash: float = Field(default=10000.0, gt=0)
    cash_per_trade: float = Field(default=2500.0, gt=0)
    parameters: dict[str, float] = Field(default_factory=dict)


class TradeRecordResponse(BaseModel):
    side: str
    trade_date: date
    price: float
    quantity: float
    pnl: float | None = None
    note: str | None = None


class EquityPointResponse(BaseModel):
    point_date: date
    equity: float
    cash: float
    position_value: float


class BacktestMetricsResponse(BaseModel):
    final_equity: float
    total_return_pct: float
    win_rate_pct: float
    max_drawdown_pct: float
    trade_count: int


class BacktestResponse(BaseModel):
    symbol: str
    strategy: StrategyName
    strategy_label: str
    bars_processed: int
    latest_close: float
    latest_signal: str
    metrics: BacktestMetricsResponse
    trades: list[TradeRecordResponse]
    equity_curve: list[EquityPointResponse]


class OutlookDirection(str, Enum):
    bullish = "bullish"
    neutral = "neutral"
    bearish = "bearish"


class OutlookComponentResponse(BaseModel):
    name: str
    label: str
    score: float
    signal: OutlookDirection
    explanation: str


class AssetModelMetricsResponse(BaseModel):
    validation_accuracy_pct: float
    walk_forward_accuracy_pct: float
    walk_forward_precision_pct: float
    average_bullish_return_pct: float
    training_samples: int
    walk_forward_windows: int


class FeatureImportanceResponse(BaseModel):
    feature: str
    label: str
    importance_pct: float


class PredictionHistoryPointResponse(BaseModel):
    point_date: date
    probability_up_pct: float
    actual_up: bool | None = None
    realized_return_pct: float | None = None


class ValidationWindowResponse(BaseModel):
    window_label: str
    accuracy_pct: float
    precision_pct: float


class AIOutlookResponse(BaseModel):
    model_name: str
    horizon: str
    direction: OutlookDirection
    freshness_status: str
    generated_at: datetime
    confidence_pct: float
    upside_probability_pct: float
    metrics: AssetModelMetricsResponse
    feature_importance: list[FeatureImportanceResponse]
    prediction_history: list[PredictionHistoryPointResponse]
    validation_windows: list[ValidationWindowResponse]
    summary: str
    components: list[OutlookComponentResponse]
    key_drivers: list[str]
    risks: list[str]
    disclaimer: str


class PaperTradingRequest(BaseModel):
    symbols: list[str] = Field(..., min_length=1)
    strategy: StrategyName
    initial_cash: float = Field(default=10000.0, gt=0)
    cash_per_trade: float = Field(default=2500.0, gt=0)
    quantity: float | None = Field(default=None, gt=0)
    ai_entry_threshold_pct: float = Field(default=80.0, ge=0, le=100)
    lookback_weeks: int = Field(default=104, ge=26, le=260)
    parameters: dict[str, float] = Field(default_factory=dict)


class ManualPaperTradeRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    strategy: StrategyName
    action: ManualTradeAction
    quantity: float | None = Field(default=None, gt=0)
    note: str | None = Field(default=None, max_length=250)


class PaperPositionResponse(BaseModel):
    id: int
    symbol: str
    strategy_name: str
    status: str
    quantity: float
    entry_price: float
    current_price: float
    entry_date: date
    exit_price: float | None = None
    exit_date: date | None = None
    realized_pnl: float | None = None
    unrealized_pnl: float
    notes: str | None = None


class PaperTradeResponse(BaseModel):
    id: int
    position_id: int
    symbol: str
    strategy_name: str
    side: str
    quantity: float
    price: float
    trade_date: date
    pnl: float | None = None
    note: str | None = None
    created_at: datetime


class AlertResponse(BaseModel):
    id: int
    symbol: str
    strategy_name: str
    channel: str
    message: str
    created_at: datetime


class PaperTradingResponse(BaseModel):
    executed_actions: list[str]
    positions: list[PaperPositionResponse]
    trades: list[PaperTradeResponse]
    alerts: list[AlertResponse]


class ManualPaperTradeResponse(BaseModel):
    action_summary: str
    position: PaperPositionResponse | None
    trade: PaperTradeResponse
    alerts: list[AlertResponse]


class DashboardResponse(BaseModel):
    market: MarketOverviewResponse
    backtest: BacktestResponse
    ai_outlook: AIOutlookResponse
    positions: list[PaperPositionResponse]
    trades: list[PaperTradeResponse]
    alerts: list[AlertResponse]
