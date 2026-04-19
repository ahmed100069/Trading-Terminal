from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Select, desc, select
from sqlalchemy.orm import Session

from app.models.paper_position import PaperPosition
from app.models.paper_trade import PaperTrade
from app.schemas.trading import (
    AlertResponse,
    ManualPaperTradeRequest,
    ManualPaperTradeResponse,
    ManualTradeAction,
    PaperPositionResponse,
    PaperTradeResponse,
    PaperTradingRequest,
    PaperTradingResponse,
    StrategyName,
)
from app.services.alert_service import AlertService
from app.services.ai_analysis_service import AIAnalysisService
from app.services.market_data_service import MarketDataService
from app.strategies.registry import get_strategy


class PaperTradingService:
    def __init__(
        self,
        market_data_service: MarketDataService | None = None,
        alert_service: AlertService | None = None,
        ai_analysis_service: AIAnalysisService | None = None,
    ) -> None:
        self.market_data_service = market_data_service or MarketDataService()
        self.alert_service = alert_service or AlertService()
        self.ai_analysis_service = ai_analysis_service or AIAnalysisService(
            market_data_service=self.market_data_service,
        )

    def sync(self, db: Session, request: PaperTradingRequest) -> PaperTradingResponse:
        executed_actions: list[str] = []

        for raw_symbol in request.symbols:
            symbol = raw_symbol.upper().strip()
            if not symbol:
                continue

            action = self._sync_single_symbol(db=db, symbol=symbol, request=request)
            executed_actions.append(action)

        db.commit()

        return PaperTradingResponse(
            executed_actions=executed_actions,
            positions=self.get_positions(db=db),
            trades=self.get_trades(db=db),
            alerts=self.get_alerts(db=db),
        )

    def execute_manual_trade(self, db: Session, request: ManualPaperTradeRequest) -> ManualPaperTradeResponse:
        symbol = request.symbol.upper().strip()
        market = self.market_data_service.fetch_market_overview(symbol)
        current_price = market.last_price
        trade_date = datetime.now(timezone.utc).date()
        position = self._get_open_position(db=db, symbol=symbol, strategy=request.strategy)

        if request.action is ManualTradeAction.buy:
            if request.quantity is None:
                raise ValueError("Quantity is required for a manual BUY action.")

            quantity = round(request.quantity, 6)
            if position is None:
                position = PaperPosition(
                    symbol=symbol,
                    strategy_name=request.strategy.value,
                    status="OPEN",
                    quantity=quantity,
                    entry_price=current_price,
                    current_price=current_price,
                    entry_date=trade_date,
                    notes=request.note or "Opened manually from the trading terminal.",
                )
                db.add(position)
                db.flush()
                summary = f"{symbol}: manual BUY {quantity} at {current_price:.2f}"
                alert_message = f"Manual paper BUY placed for {symbol}."
                trade_note = request.note or "Manual buy: opened a new paper position from the dashboard terminal."
            else:
                total_cost = (position.quantity * position.entry_price) + (quantity * current_price)
                updated_quantity = round(position.quantity + quantity, 6)
                position.entry_price = round(total_cost / updated_quantity, 6)
                position.quantity = updated_quantity
                position.current_price = current_price
                position.notes = request.note or "Added manually to the existing paper position."
                summary = f"{symbol}: added {quantity} at {current_price:.2f}; new position size is {updated_quantity}"
                alert_message = f"Manual paper BUY added to the open position for {symbol}."
                trade_note = request.note or "Manual add: increased the existing paper position from the dashboard terminal."

            trade = PaperTrade(
                position_id=position.id,
                symbol=symbol,
                strategy_name=request.strategy.value,
                side="BUY",
                quantity=quantity,
                price=current_price,
                trade_date=trade_date,
                note=trade_note,
            )
            db.add(trade)

            self.alert_service.create_alert(
                db=db,
                symbol=symbol,
                strategy_name=request.strategy.value,
                message=alert_message,
            )

        else:
            if position is None:
                raise ValueError("No open paper position exists for this symbol and strategy.")

            sell_quantity = round(position.quantity if request.action is ManualTradeAction.close else float(request.quantity or 0), 6)
            if sell_quantity <= 0:
                raise ValueError("Quantity is required for a manual SELL action.")
            if sell_quantity > position.quantity:
                raise ValueError("You cannot sell more than the current open paper position.")

            realized_pnl = (current_price - position.entry_price) * sell_quantity
            remaining_quantity = round(position.quantity - sell_quantity, 6)
            position.current_price = current_price
            position.realized_pnl = round((position.realized_pnl or 0.0) + realized_pnl, 2)

            if remaining_quantity <= 0:
                position.quantity = 0.0
                position.exit_price = current_price
                position.exit_date = trade_date
                position.status = "CLOSED"
                position.notes = request.note or "Closed manually from the trading terminal."
                summary = f"{symbol}: position closed at {current_price:.2f}"
                default_trade_note = "Manual close: exited the remaining paper position from the dashboard terminal."
            else:
                position.quantity = remaining_quantity
                position.notes = request.note or "Reduced manually from the trading terminal."
                summary = f"{symbol}: manual SELL {sell_quantity} at {current_price:.2f}"
                default_trade_note = "Manual partial sell: reduced the open paper position from the dashboard terminal."

            trade = PaperTrade(
                position_id=position.id,
                symbol=symbol,
                strategy_name=request.strategy.value,
                side="SELL",
                quantity=sell_quantity,
                price=current_price,
                trade_date=trade_date,
                pnl=round(realized_pnl, 2),
                note=request.note or default_trade_note,
            )
            db.add(trade)

            self.alert_service.create_alert(
                db=db,
                symbol=symbol,
                strategy_name=request.strategy.value,
                message=f"Manual paper {trade.side} placed for {symbol}.",
            )

        db.commit()
        db.refresh(trade)
        db.refresh(position)

        return ManualPaperTradeResponse(
            action_summary=summary,
            position=self._to_position_response(position),
            trade=self._to_trade_response(trade),
            alerts=self.get_alerts(db=db, symbol=symbol, strategy=request.strategy, limit=10),
        )

    def _sync_single_symbol(
        self,
        db: Session,
        symbol: str,
        request: PaperTradingRequest,
    ) -> str:
        strategy = get_strategy(request.strategy)
        price_data = self.market_data_service.fetch_weekly_bars(
            symbol=symbol,
            weeks=request.lookback_weeks,
        )
        signals = strategy.generate_signals(price_data=price_data, parameters=request.parameters)
        signal_date = price_data.index[-1].date()
        execution_date = datetime.now(timezone.utc).date()
        market = self.market_data_service.fetch_market_overview(symbol)
        execution_price = market.last_price
        latest_signal = int(signals.iloc[-1])
        ai_outlook = self.ai_analysis_service.build_outlook(
            symbol=symbol,
            strategy=request.strategy,
            weeks=request.lookback_weeks,
            initial_cash=request.initial_cash,
            cash_per_trade=request.cash_per_trade,
        )
        ai_entry_allowed = (
            ai_outlook.direction == "bullish"
            and ai_outlook.confidence_pct >= request.ai_entry_threshold_pct
        )

        position = self._get_open_position(
            db=db,
            symbol=symbol,
            strategy=request.strategy,
        )

        if position is not None:
            position.current_price = execution_price

        if (latest_signal == 1 or ai_entry_allowed) and position is None:
            quantity = round(request.quantity if request.quantity is not None else request.cash_per_trade / execution_price, 6)
            if quantity <= 0:
                return f"{symbol}: skipped because the configured trade size is not large enough to buy the asset."

            position = PaperPosition(
                symbol=symbol,
                strategy_name=request.strategy.value,
                status="OPEN",
                quantity=quantity,
                entry_price=execution_price,
                current_price=execution_price,
                entry_date=execution_date,
                notes="Opened by paper trading sync.",
            )
            db.add(position)
            db.flush()

            db.add(
                PaperTrade(
                    position_id=position.id,
                    symbol=symbol,
                    strategy_name=request.strategy.value,
                    side="BUY",
                    quantity=quantity,
                    price=execution_price,
                    trade_date=execution_date,
                    note=self._build_sync_buy_note(
                        latest_signal=latest_signal,
                        ai_outlook=ai_outlook,
                        quantity_override_used=request.quantity is not None,
                        signal_date=signal_date,
                        execution_date=execution_date,
                        execution_price=execution_price,
                    ),
                )
            )

            message = self._build_sync_buy_alert(symbol=symbol, strategy_name=request.strategy.value, latest_signal=latest_signal, ai_outlook=ai_outlook)
            self.alert_service.create_alert(
                db=db,
                symbol=symbol,
                strategy_name=request.strategy.value,
                message=message,
            )
            return self._build_sync_buy_summary(
                symbol=symbol,
                quantity=quantity,
                execution_price=execution_price,
                latest_signal=latest_signal,
                ai_outlook=ai_outlook,
            )

        if latest_signal == 0 and position is not None:
            closing_quantity = round(position.quantity, 6)
            realized_pnl = (execution_price - position.entry_price) * closing_quantity
            position.current_price = execution_price
            position.exit_price = execution_price
            position.exit_date = execution_date
            position.realized_pnl = realized_pnl
            position.status = "CLOSED"
            position.quantity = 0.0
            position.notes = "Closed by paper trading sync."

            db.add(
                PaperTrade(
                    position_id=position.id,
                    symbol=symbol,
                    strategy_name=request.strategy.value,
                    side="SELL",
                    quantity=closing_quantity,
                    price=execution_price,
                    trade_date=execution_date,
                    pnl=realized_pnl,
                    note=(
                        f"Sync exit: executed at live market price {execution_price:.2f} because the weekly strategy signal turned CASH."
                        if signal_date == execution_date
                        else (
                            f"Sync exit: executed at live market price {execution_price:.2f} on {execution_date.isoformat()} "
                            f"because the latest completed weekly signal dated {signal_date.isoformat()} turned CASH."
                        )
                    ),
                )
            )

            message = f"{symbol} generated a SELL signal for the {request.strategy.value} strategy."
            self.alert_service.create_alert(
                db=db,
                symbol=symbol,
                strategy_name=request.strategy.value,
                message=message,
            )
            return f"{symbol}: SELL {closing_quantity} shares at {execution_price:.2f}"

        signal_label = "BUY/HOLD" if latest_signal == 1 else "CASH"
        if position is not None and latest_signal == 1:
            return (
                f"{symbol}: no new paper trade because an open position already exists. "
                f"Weekly strategy is {signal_label} and AI outlook is {ai_outlook.direction} at {ai_outlook.confidence_pct:.1f}% confidence."
            )

        return (
            f"{symbol}: no buy. Weekly strategy is {signal_label} and AI outlook is {ai_outlook.direction} "
            f"at {ai_outlook.confidence_pct:.1f}% confidence. Sync entries require a weekly BUY/HOLD signal "
            f"or bullish AI confidence of at least {request.ai_entry_threshold_pct:.1f}%."
        )

    def _build_sync_buy_note(
        self,
        latest_signal: int,
        ai_outlook,
        quantity_override_used: bool,
        signal_date,
        execution_date,
        execution_price: float,
    ) -> str:
        reasons: list[str] = []
        if latest_signal == 1:
            reasons.append("the weekly strategy signal is bullish")
        if ai_outlook.direction == "bullish":
            reasons.append(f"the AI outlook is bullish at {ai_outlook.confidence_pct:.1f}% confidence")

        base_note = "Entered because " + " and ".join(reasons) + f". Executed at live market price {execution_price:.2f}."
        if signal_date != execution_date:
            base_note += f" The latest completed weekly signal was dated {signal_date.isoformat()} and the paper order was executed on {execution_date.isoformat()}."
        if quantity_override_used:
            return f"{base_note} The sync quantity override was used for sizing."
        return base_note

    def _build_sync_buy_alert(self, symbol: str, strategy_name: str, latest_signal: int, ai_outlook) -> str:
        if latest_signal == 1 and ai_outlook.direction == "bullish":
            return f"{symbol} triggered a paper BUY because both the weekly {strategy_name} signal and AI outlook were bullish."
        if latest_signal == 1:
            return f"{symbol} generated a BUY signal for the {strategy_name} strategy."
        return f"{symbol} triggered a paper BUY because the AI outlook was bullish with strong confidence."

    def _build_sync_buy_summary(self, symbol: str, quantity: float, execution_price: float, latest_signal: int, ai_outlook) -> str:
        if latest_signal == 1 and ai_outlook.direction == "bullish":
            reason = f"weekly signal BUY/HOLD and AI bullish {ai_outlook.confidence_pct:.1f}%"
        elif latest_signal == 1:
            reason = "weekly signal BUY/HOLD"
        else:
            reason = f"AI bullish {ai_outlook.confidence_pct:.1f}%"
        return f"{symbol}: BUY {quantity} shares at {execution_price:.2f} because {reason}"

    def get_positions(
        self,
        db: Session,
        symbol: str | None = None,
        strategy: StrategyName | None = None,
        live_price_overrides: dict[str, float] | None = None,
    ) -> list[PaperPositionResponse]:
        statement: Select[tuple[PaperPosition]] = select(PaperPosition).order_by(
            desc(PaperPosition.updated_at)
        )

        if symbol:
            statement = statement.where(PaperPosition.symbol == symbol.upper())
        if strategy:
            statement = statement.where(PaperPosition.strategy_name == strategy.value)

        positions = db.execute(statement).scalars().all()
        open_positions = [position for position in positions if position.status == "OPEN"]
        prices_updated = False
        for position in open_positions:
            override_price = (live_price_overrides or {}).get(position.symbol)
            if override_price is not None:
                if position.current_price != override_price:
                    position.current_price = override_price
                    prices_updated = True
                continue

            try:
                live_market = self.market_data_service.fetch_market_overview(position.symbol)
            except ValueError:
                continue
            if position.current_price != live_market.last_price:
                position.current_price = live_market.last_price
                prices_updated = True

        if prices_updated:
            db.flush()

        return [self._to_position_response(position) for position in positions]

    def get_trades(
        self,
        db: Session,
        symbol: str | None = None,
        strategy: StrategyName | None = None,
    ) -> list[PaperTradeResponse]:
        statement: Select[tuple[PaperTrade]] = select(PaperTrade).order_by(desc(PaperTrade.trade_date))

        if symbol:
            statement = statement.where(PaperTrade.symbol == symbol.upper())
        if strategy:
            statement = statement.where(PaperTrade.strategy_name == strategy.value)

        trades = db.execute(statement).scalars().all()
        return [self._to_trade_response(trade) for trade in trades]

    def get_alerts(
        self,
        db: Session,
        symbol: str | None = None,
        strategy: StrategyName | None = None,
        limit: int = 20,
    ) -> list[AlertResponse]:
        from app.models.alert_event import AlertEvent

        statement = select(AlertEvent).order_by(desc(AlertEvent.created_at)).limit(limit)

        if symbol:
            statement = statement.where(AlertEvent.symbol == symbol.upper())
        if strategy:
            statement = statement.where(AlertEvent.strategy_name == strategy.value)

        alerts = db.execute(statement).scalars().all()
        return [
            AlertResponse(
                id=alert.id,
                symbol=alert.symbol,
                strategy_name=alert.strategy_name,
                channel=alert.channel,
                message=alert.message,
                created_at=alert.created_at,
            )
            for alert in alerts
        ]

    def _get_open_position(
        self,
        db: Session,
        symbol: str,
        strategy: StrategyName,
    ) -> PaperPosition | None:
        statement = (
            select(PaperPosition)
            .where(PaperPosition.symbol == symbol)
            .where(PaperPosition.strategy_name == strategy.value)
            .where(PaperPosition.status == "OPEN")
        )
        return db.execute(statement).scalars().first()

    def _to_position_response(self, position: PaperPosition) -> PaperPositionResponse:
        unrealized_pnl = (
            (position.current_price - position.entry_price) * position.quantity
            if position.status == "OPEN"
            else 0.0
        )

        return PaperPositionResponse(
            id=position.id,
            symbol=position.symbol,
            strategy_name=position.strategy_name,
            status=position.status,
            quantity=round(position.quantity, 6),
            entry_price=round(position.entry_price, 2),
            current_price=round(position.current_price, 2),
            entry_date=position.entry_date,
            exit_price=round(position.exit_price, 2) if position.exit_price is not None else None,
            exit_date=position.exit_date,
            realized_pnl=round(position.realized_pnl, 2) if position.realized_pnl is not None else None,
            unrealized_pnl=round(unrealized_pnl, 2),
            notes=position.notes,
        )

    def _to_trade_response(self, trade: PaperTrade) -> PaperTradeResponse:
        return PaperTradeResponse(
            id=trade.id,
            position_id=trade.position_id,
            symbol=trade.symbol,
            strategy_name=trade.strategy_name,
            side=trade.side,
            quantity=round(trade.quantity, 6),
            price=round(trade.price, 2),
            trade_date=trade.trade_date,
            pnl=round(trade.pnl, 2) if trade.pnl is not None else None,
            note=trade.note,
            created_at=trade.created_at,
        )
