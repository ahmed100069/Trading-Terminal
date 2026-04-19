from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd


@dataclass
class TradeRecord:
    side: str
    trade_date: date
    price: float
    quantity: float
    pnl: float | None = None
    note: str | None = None


@dataclass
class EquityPoint:
    point_date: date
    equity: float
    cash: float
    position_value: float


@dataclass
class BacktestResult:
    trades: list[TradeRecord]
    equity_curve: list[EquityPoint]
    total_return_pct: float
    win_rate_pct: float
    max_drawdown_pct: float
    final_equity: float


def run_weekly_backtest(
    price_data: pd.DataFrame,
    signals: pd.Series,
    initial_cash: float,
    cash_per_trade: float,
) -> BacktestResult:
    if price_data.empty:
        raise ValueError("No price data available for backtesting.")

    cash = float(initial_cash)
    quantity_held = 0.0
    entry_price = 0.0
    previous_signal = 0
    trades: list[TradeRecord] = []
    closed_trade_pnls: list[float] = []
    equity_curve: list[EquityPoint] = []

    for timestamp, row in price_data.iterrows():
        close_price = float(row["close"])
        current_signal = int(signals.loc[timestamp])

        if current_signal == 1 and previous_signal == 0 and quantity_held == 0:
            trade_budget = min(cash, cash_per_trade)
            quantity = round(trade_budget / close_price, 6)

            if quantity > 0:
                cash -= quantity * close_price
                quantity_held = quantity
                entry_price = close_price
                trades.append(
                    TradeRecord(
                        side="BUY",
                        trade_date=timestamp.date(),
                        price=close_price,
                        quantity=quantity,
                        note="Signal turned bullish.",
                    )
                )

        elif current_signal == 0 and previous_signal == 1 and quantity_held > 0:
            proceeds = quantity_held * close_price
            pnl = proceeds - (quantity_held * entry_price)
            cash += proceeds
            trades.append(
                TradeRecord(
                    side="SELL",
                    trade_date=timestamp.date(),
                    price=close_price,
                    quantity=quantity_held,
                    pnl=pnl,
                    note="Signal turned defensive.",
                )
            )
            closed_trade_pnls.append(pnl)
            quantity_held = 0.0
            entry_price = 0.0

        position_value = quantity_held * close_price
        equity_curve.append(
            EquityPoint(
                point_date=timestamp.date(),
                equity=cash + position_value,
                cash=cash,
                position_value=position_value,
            )
        )
        previous_signal = current_signal

    final_equity = equity_curve[-1].equity if equity_curve else initial_cash
    equity_series = pd.Series([point.equity for point in equity_curve], dtype=float)
    running_max = equity_series.cummax()
    drawdown_series = (equity_series - running_max) / running_max.replace(0, pd.NA)
    max_drawdown_pct = float(max(0.0, (-drawdown_series.min(skipna=True)) * 100))

    total_return_pct = ((final_equity - initial_cash) / initial_cash) * 100
    win_rate_pct = (
        (sum(pnl > 0 for pnl in closed_trade_pnls) / len(closed_trade_pnls)) * 100
        if closed_trade_pnls
        else 0.0
    )

    return BacktestResult(
        trades=trades,
        equity_curve=equity_curve,
        total_return_pct=total_return_pct,
        win_rate_pct=win_rate_pct,
        max_drawdown_pct=max_drawdown_pct,
        final_equity=final_equity,
    )
