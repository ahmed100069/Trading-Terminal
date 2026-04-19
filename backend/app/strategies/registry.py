from __future__ import annotations

from app.schemas.trading import StrategyDefinition, StrategyName
from app.strategies.base import BaseStrategy
from app.strategies.momentum import MomentumStrategy
from app.strategies.moving_average import MovingAverageCrossoverStrategy
from app.strategies.rsi import RSIStrategy

STRATEGY_REGISTRY: dict[StrategyName, BaseStrategy] = {
    StrategyName.moving_average: MovingAverageCrossoverStrategy(),
    StrategyName.rsi: RSIStrategy(),
    StrategyName.momentum: MomentumStrategy(),
}


def get_strategy(name: StrategyName) -> BaseStrategy:
    try:
        return STRATEGY_REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unsupported strategy '{name}'.") from exc


def list_strategies() -> list[StrategyDefinition]:
    return [
        StrategyDefinition(
            name=strategy_name,
            label=strategy.label,
            description=strategy.description,
            default_parameters=strategy.default_parameters,
        )
        for strategy_name, strategy in STRATEGY_REGISTRY.items()
    ]
