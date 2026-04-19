from fastapi import APIRouter

from app.schemas.trading import StrategyDefinition
from app.strategies.registry import list_strategies

router = APIRouter()


@router.get("", response_model=list[StrategyDefinition])
def get_strategies() -> list[StrategyDefinition]:
    return list_strategies()
