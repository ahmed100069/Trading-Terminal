from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models as _models
from app.core.database import Base
from app.models.alert_event import AlertEvent
from app.models.paper_position import PaperPosition
from app.models.paper_trade import PaperTrade
from app.services.paper_trading_service import PaperTradingService


def test_paper_trading_reads_are_scoped_to_the_authenticated_user() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)
    service = PaperTradingService()

    with Session(engine) as db:
        first_position = PaperPosition(
            user_id="user-one",
            symbol="BTCUSDT",
            strategy_name="momentum",
            status="CLOSED",
            quantity=0,
            entry_price=100,
            current_price=110,
            entry_date=date.today(),
        )
        second_position = PaperPosition(
            user_id="user-two",
            symbol="BTCUSDT",
            strategy_name="momentum",
            status="CLOSED",
            quantity=0,
            entry_price=100,
            current_price=90,
            entry_date=date.today(),
        )
        db.add_all([first_position, second_position])
        db.flush()
        db.add_all(
            [
                PaperTrade(
                    position_id=first_position.id,
                    symbol="BTCUSDT",
                    strategy_name="momentum",
                    side="BUY",
                    quantity=1,
                    price=100,
                    trade_date=date.today(),
                ),
                PaperTrade(
                    position_id=second_position.id,
                    symbol="BTCUSDT",
                    strategy_name="momentum",
                    side="BUY",
                    quantity=1,
                    price=100,
                    trade_date=date.today(),
                ),
            ]
        )
        db.add_all(
            [
                AlertEvent(user_id="user-one", symbol="BTCUSDT", strategy_name="momentum", message="one"),
                AlertEvent(user_id="user-two", symbol="BTCUSDT", strategy_name="momentum", message="two"),
            ]
        )
        db.commit()

        assert [item.id for item in service.get_positions(db, user_id="user-one")] == [first_position.id]
        assert [item.position_id for item in service.get_trades(db, user_id="user-one")] == [first_position.id]
        assert [item.message for item in service.get_alerts(db, user_id="user-one")] == ["one"]

    engine.dispose()