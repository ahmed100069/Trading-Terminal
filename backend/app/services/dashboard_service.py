from __future__ import annotations

from sqlalchemy.orm import Session

from app.schemas.trading import BacktestRequest, DashboardResponse, StrategyName
from app.services.ai_analysis_service import AIAnalysisService
from app.services.backtest_service import BacktestService
from app.services.market_data_service import MarketDataService
from app.services.paper_trading_service import PaperTradingService


class DashboardService:
    def __init__(
        self,
        backtest_service: BacktestService | None = None,
        paper_trading_service: PaperTradingService | None = None,
        market_data_service: MarketDataService | None = None,
        ai_analysis_service: AIAnalysisService | None = None,
    ) -> None:
        self.market_data_service = market_data_service or MarketDataService()
        self.backtest_service = backtest_service or BacktestService(self.market_data_service)
        self.paper_trading_service = paper_trading_service or PaperTradingService(
            market_data_service=self.market_data_service,
        )
        self.ai_analysis_service = ai_analysis_service or AIAnalysisService(
            market_data_service=self.market_data_service,
            backtest_service=self.backtest_service,
        )

    def get_summary(
        self,
        db: Session,
        symbol: str,
        strategy: StrategyName,
        weeks: int,
        initial_cash: float,
        cash_per_trade: float,
    ) -> DashboardResponse:
        normalized_symbol = symbol.upper()
        market = self.market_data_service.fetch_market_overview(normalized_symbol)
        backtest = self.backtest_service.run_backtest(
            BacktestRequest(
                symbol=normalized_symbol,
                strategy=strategy,
                weeks=weeks,
                initial_cash=initial_cash,
                cash_per_trade=cash_per_trade,
            )
        )
        ai_outlook = self.ai_analysis_service.build_outlook(
            symbol=normalized_symbol,
            strategy=strategy,
            weeks=weeks,
            initial_cash=initial_cash,
            cash_per_trade=cash_per_trade,
            overview=market,
            backtest=backtest,
        )

        positions = self.paper_trading_service.get_positions(
            db=db,
            symbol=normalized_symbol,
            strategy=strategy,
            live_price_overrides={normalized_symbol: market.last_price},
        )
        trades = self.paper_trading_service.get_trades(
            db=db,
            symbol=normalized_symbol,
            strategy=strategy,
        )
        alerts = self.paper_trading_service.get_alerts(
            db=db,
            symbol=normalized_symbol,
            strategy=strategy,
            limit=10,
        )

        return DashboardResponse(
            market=market,
            backtest=backtest,
            ai_outlook=ai_outlook,
            positions=positions,
            trades=trades,
            alerts=alerts,
        )
