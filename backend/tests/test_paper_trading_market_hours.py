from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pandas as pd
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app import models as _models
from app.core.database import Base
from app.models.paper_position import PaperPosition
from app.schemas.trading import ManualPaperTradeRequest, ManualTradeAction, PaperTradingRequest, StrategyName
from app.services import paper_trading_service as paper_trading_module
from app.services.market_session_service import get_market_session
from app.services.paper_trading_service import PaperTradingService


@pytest.mark.parametrize(
    "action",
    [ManualTradeAction.buy, ManualTradeAction.sell, ManualTradeAction.close],
)
def test_manual_equity_trade_is_rejected_when_exchange_is_closed(monkeypatch, action) -> None:
    closed_session = get_market_session(
        "RELIANCE.NS",
        datetime(2026, 10, 10, 4, 30, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(paper_trading_module, "get_market_session", lambda _: closed_session)
    request = ManualPaperTradeRequest(
        symbol="RELIANCE.NS",
        strategy=StrategyName.momentum,
        action=action,
        quantity=1 if action is not ManualTradeAction.close else None,
    )

    with pytest.raises(ValueError, match="NSE is closed.*next session opens"):
        PaperTradingService().execute_manual_trade(db=None, request=request, user_id="test-user")


def test_strategy_sync_skips_closed_equity_without_creating_a_trade(monkeypatch) -> None:
    closed_session = get_market_session(
        "RELIANCE.NS",
        datetime(2026, 10, 10, 4, 30, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(paper_trading_module, "get_market_session", lambda _: closed_session)
    request = PaperTradingRequest(symbols=["RELIANCE.NS"], strategy=StrategyName.momentum)

    result = PaperTradingService()._sync_single_symbol(
        db=None,
        symbol="RELIANCE.NS",
        request=request,
        user_id="test-user",
    )

    assert result.startswith("RELIANCE.NS: skipped. NSE is closed.")


def test_manual_buy_over_practice_budget_does_not_create_position(monkeypatch) -> None:
    class MarketData:
        @staticmethod
        def fetch_market_overview(_symbol):
            return SimpleNamespace(last_price=100.0)

    monkeypatch.setattr(
        paper_trading_module,
        "get_market_session",
        lambda symbol: get_market_session(symbol, datetime(2026, 10, 8, 4, 30, tzinfo=timezone.utc)),
    )
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)
    service = PaperTradingService(market_data_service=MarketData())
    request = ManualPaperTradeRequest(
        symbol="BTCUSDT",
        strategy=StrategyName.momentum,
        action=ManualTradeAction.buy,
        quantity=10,
        risk_budget_amount=10,
    )

    with Session(engine) as db:
        with pytest.raises(ValueError, match="2% price-drop scenario is about 20.00"):
            service.execute_manual_trade(db=db, request=request, user_id="test-user")
        assert db.execute(select(func.count()).select_from(PaperPosition)).scalar_one() == 0

    engine.dispose()


def test_closed_manual_trade_keeps_budget_and_reports_realized_pnl(monkeypatch) -> None:
    class MarketData:
        price = 100.0

        def fetch_market_overview(self, _symbol):
            return SimpleNamespace(last_price=self.price)

    monkeypatch.setattr(
        paper_trading_module,
        "get_market_session",
        lambda symbol: get_market_session(symbol, datetime(2026, 10, 8, 4, 30, tzinfo=timezone.utc)),
    )
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)
    market_data = MarketData()
    service = PaperTradingService(market_data_service=market_data)

    with Session(engine) as db:
        buy_result = service.execute_manual_trade(
            db=db,
            request=ManualPaperTradeRequest(
                symbol="BTCUSDT",
                strategy=StrategyName.momentum,
                action=ManualTradeAction.buy,
                quantity=1,
                risk_budget_amount=10,
            ),
            user_id="test-user",
        )
        assert buy_result.position.risk_budget_amount == 10

        market_data.price = 90.0
        close_result = service.execute_manual_trade(
            db=db,
            request=ManualPaperTradeRequest(
                symbol="BTCUSDT",
                strategy=StrategyName.momentum,
                action=ManualTradeAction.close,
                risk_budget_amount=100,
            ),
            user_id="test-user",
        )

        assert close_result.position.status == "CLOSED"
        assert close_result.position.risk_budget_amount == 10
        assert close_result.trade.pnl == -10

    engine.dispose()


def test_strategy_sync_skips_entry_above_practice_budget() -> None:
    class MarketData:
        @staticmethod
        def fetch_weekly_bars(symbol, weeks):
            dates = pd.date_range("2023-01-01", periods=weeks, freq="W")
            return pd.DataFrame(
                {"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 1.0},
                index=dates,
            )

        @staticmethod
        def fetch_market_overview(_symbol):
            return SimpleNamespace(last_price=100.0)

    class Backtest:
        @staticmethod
        def run_backtest(*_args, **_kwargs):
            return SimpleNamespace(latest_signal="BUY")

    class AIAnalysis:
        @staticmethod
        def build_outlook(*_args, **_kwargs):
            return SimpleNamespace(direction="neutral", confidence_pct=50.0)

    service = PaperTradingService(market_data_service=MarketData())
    service.backtest_service = Backtest()
    service.ai_analysis_service = AIAnalysis()
    request = PaperTradingRequest(
        symbols=["BTCUSDT"],
        strategy=StrategyName.momentum,
        cash_per_trade=100_000,
        risk_budget_amount=500,
    )

    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        result = service._sync_single_symbol(db, "BTCUSDT", request, "test-user")
        assert result.startswith("BTCUSDT: skipped. A 2% price-drop scenario is about 2000.00")
        assert db.execute(select(func.count()).select_from(PaperPosition)).scalar_one() == 0
    engine.dispose()