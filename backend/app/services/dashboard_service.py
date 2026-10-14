from __future__ import annotations

from time import perf_counter

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.trading import BacktestRequest, DashboardResponse, MonitoringResponse, StrategyName
from app.services.ai_analysis_service import AIAnalysisService
from app.services.backtest_service import BacktestService
from app.services.market_data_service import MarketDataService
from app.services.monitoring_service import MarketMonitoringService
from app.services.paper_trading_service import PaperTradingService


class DashboardService:
    def __init__(
        self,
        backtest_service: BacktestService | None = None,
        paper_trading_service: PaperTradingService | None = None,
        market_data_service: MarketDataService | None = None,
        ai_analysis_service: AIAnalysisService | None = None,
        monitoring_service: MarketMonitoringService | None = None,
    ) -> None:
        self.monitoring_service = monitoring_service or MarketMonitoringService()
        self.market_data_service = market_data_service or MarketDataService()
        self.backtest_service = backtest_service or BacktestService(self.market_data_service)
        self.paper_trading_service = paper_trading_service or PaperTradingService(
            market_data_service=self.market_data_service,
            backtest_service=self.backtest_service,
        )
        self.ai_analysis_service = ai_analysis_service or AIAnalysisService(
            market_data_service=self.market_data_service,
            backtest_service=self.backtest_service,
        )

    def get_summary(
        self,
        db: Session,
        user_id: str,
        symbol: str,
        strategy: StrategyName,
        weeks: int,
        initial_cash: float,
        cash_per_trade: float,
    ) -> DashboardResponse:
        request_started = perf_counter()
        normalized_symbol = symbol.upper()
        market = self.market_data_service.fetch_market_overview(normalized_symbol)
        model_history_weeks = min(max(weeks + 40, 80), 220)
        weekly_bars = self.market_data_service.fetch_weekly_bars(
            normalized_symbol,
            max(weeks, model_history_weeks),
        )
        backtest = self.backtest_service.run_backtest(
            BacktestRequest(
                symbol=normalized_symbol,
                strategy=strategy,
                weeks=weeks,
                initial_cash=initial_cash,
                cash_per_trade=cash_per_trade,
            ),
            price_data=weekly_bars.tail(weeks),
        )
        prediction_started = perf_counter()
        ai_outlook = self.ai_analysis_service.build_outlook(
            symbol=normalized_symbol,
            strategy=strategy,
            weeks=weeks,
            initial_cash=initial_cash,
            cash_per_trade=cash_per_trade,
            overview=market,
            backtest=backtest,
            weekly_bars=weekly_bars.tail(model_history_weeks),
        )
        prediction_latency_ms = round((perf_counter() - prediction_started) * 1000)

        positions = self.paper_trading_service.get_positions(
            db=db,
            user_id=user_id,
            symbol=normalized_symbol,
            strategy=strategy,
            live_price_overrides={normalized_symbol: market.last_price},
        )
        trades = self.paper_trading_service.get_trades(
            db=db,
            user_id=user_id,
            symbol=normalized_symbol,
            strategy=strategy,
        )
        alerts = self.paper_trading_service.get_alerts(
            db=db,
            user_id=user_id,
            symbol=normalized_symbol,
            strategy=strategy,
            limit=10,
        )
        try:
            db.execute(text("SELECT 1"))
            database_status = "LIVE"
        except Exception:
            database_status = "UNAVAILABLE"

        monitoring = MonitoringResponse(
            symbol=normalized_symbol,
            market_snapshot=self.monitoring_service.build_snapshot(
                market=market,
                ai_outlook=ai_outlook,
            ),
            system_health=self.monitoring_service.build_system_health(
                market=market,
                ai_outlook=ai_outlook,
                database_status=database_status,
                backend_latency_ms=round((perf_counter() - request_started) * 1000),
                prediction_latency_ms=prediction_latency_ms,
            ),
        )

        return DashboardResponse(
            market=market,
            backtest=backtest,
            ai_outlook=ai_outlook,
            monitoring=monitoring,
            positions=positions,
            trades=trades,
            alerts=alerts,
        )
