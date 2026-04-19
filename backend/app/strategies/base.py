from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd


class BaseStrategy(ABC):
    name: str
    label: str
    description: str
    default_parameters: dict[str, float]

    def resolve_parameters(self, parameters: dict[str, float] | None = None) -> dict[str, float]:
        merged_parameters = dict(self.default_parameters)
        if parameters:
            merged_parameters.update(parameters)
        return merged_parameters

    @abstractmethod
    def generate_signals(
        self,
        price_data: pd.DataFrame,
        parameters: dict[str, float] | None = None,
    ) -> pd.Series:
        """Return a long-only weekly signal series where 1 means invested and 0 means in cash."""
