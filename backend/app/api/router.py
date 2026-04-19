from fastapi import APIRouter

from app.api import backtests, dashboard, health, market, paper_trading, strategies

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(backtests.router, prefix="/backtests", tags=["backtests"])
api_router.include_router(
    paper_trading.router,
    prefix="/paper-trading",
    tags=["paper-trading"],
)
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
