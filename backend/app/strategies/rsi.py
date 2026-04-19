from __future__ import annotations

import numpy as np
import pandas as pd

from app.strategies.base import BaseStrategy


class RSIStrategy(BaseStrategy):
    name = "rsi"
    label = "RSI Reversal"
    description = "Buys after weekly RSI falls into oversold territory and exits when RSI becomes overbought."
    default_parameters = {
        "rsi_window": 14.0,
        "buy_threshold": 35.0,
        "sell_threshold": 65.0,
    }

    def generate_signals(
        self,
        price_data: pd.DataFrame,
        parameters: dict[str, float] | None = None,
    ) -> pd.Series:
        params = self.resolve_parameters(parameters)
        window = int(params["rsi_window"])
        buy_threshold = float(params["buy_threshold"])
        sell_threshold = float(params["sell_threshold"])

        if buy_threshold >= sell_threshold:
            raise ValueError("The RSI buy threshold must be smaller than the sell threshold.")

        delta = price_data["close"].diff()
        gains = delta.clip(lower=0)
        losses = -delta.clip(upper=0)

        average_gain = gains.rolling(window=window, min_periods=window).mean()
        average_loss = losses.rolling(window=window, min_periods=window).mean()

        relative_strength = average_gain / average_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + relative_strength))
        rsi = rsi.where(average_loss != 0, 100)
        rsi = rsi.where(~((average_gain == 0) & (average_loss == 0)), 50)
        rsi = rsi.fillna(50)

        signals = pd.Series(0, index=price_data.index, dtype=int)
        for index in range(1, len(rsi)):
            previous_signal = int(signals.iloc[index - 1])
            current_rsi = float(rsi.iloc[index])

            if current_rsi <= buy_threshold:
                signals.iloc[index] = 1
            elif current_rsi >= sell_threshold:
                signals.iloc[index] = 0
            else:
                signals.iloc[index] = previous_signal

        return signals
