from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.trading import (
    AlertResponse,
    ManualPaperTradeRequest,
    ManualPaperTradeResponse,
    PaperPositionResponse,
    PaperTradeResponse,
    PaperTradingRequest,
    PaperTradingResponse,
    StrategyName,
)
from app.services.paper_trading_service import PaperTradingService

router = APIRouter()
paper_trading_service = PaperTradingService()


@router.post("/sync", response_model=PaperTradingResponse)
def sync_paper_trades(
    request: PaperTradingRequest,
    db: Session = Depends(get_db),
) -> PaperTradingResponse:
    try:
        return paper_trading_service.sync(db=db, request=request)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/manual", response_model=ManualPaperTradeResponse)
def execute_manual_paper_trade(
    request: ManualPaperTradeRequest,
    db: Session = Depends(get_db),
) -> ManualPaperTradeResponse:
    try:
        return paper_trading_service.execute_manual_trade(db=db, request=request)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/positions", response_model=list[PaperPositionResponse])
def get_positions(
    symbol: Optional[str] = Query(default=None),
    strategy: Optional[StrategyName] = Query(default=None),
    db: Session = Depends(get_db),
) -> list[PaperPositionResponse]:
    return paper_trading_service.get_positions(db=db, symbol=symbol, strategy=strategy)


@router.get("/trades", response_model=list[PaperTradeResponse])
def get_trades(
    symbol: Optional[str] = Query(default=None),
    strategy: Optional[StrategyName] = Query(default=None),
    db: Session = Depends(get_db),
) -> list[PaperTradeResponse]:
    return paper_trading_service.get_trades(db=db, symbol=symbol, strategy=strategy)


@router.get("/alerts", response_model=list[AlertResponse])
def get_alerts(
    symbol: Optional[str] = Query(default=None),
    strategy: Optional[StrategyName] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[AlertResponse]:
    return paper_trading_service.get_alerts(
        db=db,
        symbol=symbol,
        strategy=strategy,
        limit=limit,
    )
