from __future__ import annotations

from app.backtesting.engine import run_weekly_backtest
from app.schemas.trading import (
    BacktestMetricsResponse,
    BacktestRequest,
    BacktestResponse,
    EquityPointResponse,
    TradeRecordResponse,
)
from app.services.market_data_service import MarketDataService
from app.strategies.registry import get_strategy


class BacktestService:
    def __init__(self, market_data_service: MarketDataService | None = None) -> None:
        self.market_data_service = market_data_service or MarketDataService()

    def run_backtest(self, request: BacktestRequest) -> BacktestResponse:
        symbol = request.symbol.upper()
        strategy = get_strategy(request.strategy)
        price_data = self.market_data_service.fetch_weekly_bars(
            symbol=symbol,
            weeks=request.weeks,
        )
        signals = strategy.generate_signals(price_data=price_data, parameters=request.parameters)
        result = run_weekly_backtest(
            price_data=price_data,
            signals=signals,
            initial_cash=request.initial_cash,
            cash_per_trade=request.cash_per_trade,
        )

        return BacktestResponse(
            symbol=symbol,
            strategy=request.strategy,
            strategy_label=strategy.label,
            bars_processed=len(price_data),
            latest_close=round(float(price_data["close"].iloc[-1]), 2),
            latest_signal="BUY" if int(signals.iloc[-1]) == 1 else "CASH",
            metrics=BacktestMetricsResponse(
                final_equity=round(result.final_equity, 2),
                total_return_pct=round(result.total_return_pct, 2),
                win_rate_pct=round(result.win_rate_pct, 2),
                max_drawdown_pct=round(result.max_drawdown_pct, 2),
                trade_count=len(result.trades),
            ),
            trades=[
                TradeRecordResponse(
                    side=trade.side,
                    trade_date=trade.trade_date,
                    price=round(trade.price, 2),
                    quantity=round(trade.quantity, 6),
                    pnl=round(trade.pnl, 2) if trade.pnl is not None else None,
                    note=trade.note,
                )
                for trade in result.trades
            ],
            equity_curve=[
                EquityPointResponse(
                    point_date=point.point_date,
                    equity=round(point.equity, 2),
                    cash=round(point.cash, 2),
                    position_value=round(point.position_value, 2),
                )
                for point in result.equity_curve
            ],
        )

