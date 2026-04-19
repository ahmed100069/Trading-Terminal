from __future__ import annotations

import pandas as pd

from app.strategies.base import BaseStrategy


class MomentumStrategy(BaseStrategy):
    name = "momentum"
    label = "12-Week Momentum"
    description = "Buys when the asset's 12-week return is positive and moves to cash when momentum turns negative."
    default_parameters = {
        "lookback_weeks": 12.0,
    }

    def generate_signals(
        self,
        price_data: pd.DataFrame,
        parameters: dict[str, float] | None = None,
    ) -> pd.Series:
        params = self.resolve_parameters(parameters)
        lookback_weeks = int(params["lookback_weeks"])

        momentum = price_data["close"].pct_change(lookback_weeks)
        signals = (momentum > 0).astype(int)
        return signals.fillna(0).astype(int)

