from __future__ import annotations

import pandas as pd

from app.strategies.base import BaseStrategy


class MovingAverageCrossoverStrategy(BaseStrategy):
    name = "moving_average"
    label = "Moving Average Crossover"
    description = "Buys when a short weekly moving average rises above a longer weekly moving average."
    default_parameters = {
        "short_window": 4.0,
        "long_window": 12.0,
    }

    def generate_signals(
        self,
        price_data: pd.DataFrame,
        parameters: dict[str, float] | None = None,
    ) -> pd.Series:
        params = self.resolve_parameters(parameters)
        short_window = int(params["short_window"])
        long_window = int(params["long_window"])

        if short_window >= long_window:
            raise ValueError("The short moving average window must be smaller than the long window.")

        short_average = price_data["close"].rolling(window=short_window).mean()
        long_average = price_data["close"].rolling(window=long_window).mean()

        signals = (short_average > long_average).astype(int)
        return signals.fillna(0).astype(int)
