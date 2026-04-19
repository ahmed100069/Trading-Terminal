from fastapi import APIRouter, HTTPException

from app.schemas.trading import BacktestRequest, BacktestResponse
from app.services.backtest_service import BacktestService

router = APIRouter()
backtest_service = BacktestService()


@router.post("/run", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest) -> BacktestResponse:
    try:
        return backtest_service.run_backtest(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
