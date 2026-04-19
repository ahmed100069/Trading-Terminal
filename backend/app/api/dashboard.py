from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.schemas.trading import DashboardResponse, StrategyName
from app.services.dashboard_service import DashboardService

router = APIRouter()
dashboard_service = DashboardService()


@router.get("/summary", response_model=DashboardResponse)
def get_dashboard_summary(
    symbol: str = Query(default=settings.default_symbol, min_length=1),
    strategy: StrategyName = Query(default=StrategyName.momentum),
    weeks: int = Query(default=156, ge=26, le=260),
    initial_cash: float = Query(default=10000.0, gt=0),
    cash_per_trade: float = Query(default=2500.0, gt=0),
    db: Session = Depends(get_db),
) -> DashboardResponse:
    try:
        return dashboard_service.get_summary(
            db=db,
            symbol=symbol,
            strategy=strategy,
            weeks=weeks,
            initial_cash=initial_cash,
            cash_per_trade=cash_per_trade,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
