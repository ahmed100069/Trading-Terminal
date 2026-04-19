from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

from app.schemas.trading import (
    AIOutlookResponse,
    AssetModelMetricsResponse,
    BacktestResponse,
    BacktestRequest,
    FeatureImportanceResponse,
    MarketOverviewResponse,
    OutlookComponentResponse,
    OutlookDirection,
    PredictionHistoryPointResponse,
    StrategyName,
    ValidationWindowResponse,
)
from app.services.backtest_service import BacktestService
from app.services.market_data_service import MarketDataService


FEATURE_LABELS: dict[str, str] = {
    "return_1w": "1W Return",
    "return_2w": "2W Return",
    "return_4w": "4W Return",
    "return_8w": "8W Return",
    "return_12w": "12W Return",
    "sma_4_gap": "Price vs SMA 4",
    "sma_12_gap": "Price vs SMA 12",
    "rsi_6": "RSI 6",
    "volatility_4w": "4W Volatility",
    "volume_ratio_4w": "Volume Ratio",
    "weekly_signal_hint": "Momentum Hint",
}


@dataclass
class ComponentResult:
    name: str
    label: str
    raw_score: float
    explanation: str

    @property
    def score(self) -> float:
        return round((self.raw_score + 1.0) * 50.0, 1)

    @property
    def signal(self) -> OutlookDirection:
        if self.raw_score > 0.18:
            return OutlookDirection.bullish
        if self.raw_score < -0.18:
            return OutlookDirection.bearish
        return OutlookDirection.neutral


@dataclass
class WalkForwardWindow:
    window_label: str
    accuracy_pct: float
    precision_pct: float


@dataclass
class WalkForwardResult:
    accuracy_pct: float
    precision_pct: float
    average_bullish_return_pct: float
    windows: int
    history: list[WalkForwardWindow]


@dataclass
class ModelTrainingResult:
    probability_up: float
    validation_accuracy_pct: float
    training_samples: int
    walk_forward: WalkForwardResult
    feature_importance: list[FeatureImportanceResponse]
    prediction_history: list[PredictionHistoryPointResponse]
    explanation: str


class AIAnalysisService:
    def __init__(
        self,
        market_data_service: MarketDataService | None = None,
        backtest_service: BacktestService | None = None,
    ) -> None:
        self.market_data_service = market_data_service or MarketDataService()
        self.backtest_service = backtest_service or BacktestService(self.market_data_service)
        self.model_name = "Trained Weekly Logistic Regression"

    def build_outlook(
        self,
        symbol: str,
        strategy: StrategyName,
        weeks: int,
        initial_cash: float,
        cash_per_trade: float,
        overview: MarketOverviewResponse | None = None,
        backtest: BacktestResponse | None = None,
    ) -> AIOutlookResponse:
        generated_at = datetime.now(timezone.utc)
        market_overview = overview or self.market_data_service.fetch_market_overview(symbol)
        daily_candles = self.market_data_service.fetch_candles(symbol, "1d", 90)
        if len(daily_candles) < 30:
            raise ValueError("Not enough daily candles are available to generate the AI outlook.")

        daily_frame = pd.DataFrame(
            {
                "close": [candle.close for candle in daily_candles],
                "high": [candle.high for candle in daily_candles],
                "low": [candle.low for candle in daily_candles],
                "volume": [candle.volume for candle in daily_candles],
                "quote_volume": [candle.quote_volume for candle in daily_candles],
            }
        )
        weekly_bars = self.market_data_service.fetch_weekly_bars(symbol, min(max(weeks + 40, 80), 220))
        backtest_result = backtest or self.backtest_service.run_backtest(
            BacktestRequest(
                symbol=symbol,
                strategy=strategy,
                weeks=weeks,
                initial_cash=initial_cash,
                cash_per_trade=cash_per_trade,
            )
        )
        model_result = self._train_weekly_model(weekly_bars, backtest_result.latest_signal)

        components = [
            self._ml_component(model_result),
            self._technical_component(daily_frame),
            self._sentiment_component(daily_frame, backtest_result.latest_signal),
            self._whale_component(daily_frame),
            self._risk_component(weekly_bars, backtest_result.metrics.win_rate_pct, backtest_result.metrics.max_drawdown_pct),
        ]

        weighted_score = (
            components[0].raw_score * 0.38
            + components[1].raw_score * 0.22
            + components[2].raw_score * 0.14
            + components[3].raw_score * 0.12
            + components[4].raw_score * 0.14
        )
        direction = self._direction_from_score(weighted_score)
        alignment_bonus = sum(1 for component in components if component.signal == direction)
        confidence_pct = min(
            96.0,
            round(
                44.0
                + model_result.validation_accuracy_pct * 0.28
                + model_result.walk_forward.accuracy_pct * 0.22
                + abs(weighted_score) * 18.0
                + alignment_bonus * 2.0,
                1,
            ),
        )
        upside_probability_pct = round(min(95.0, max(5.0, 50.0 + weighted_score * 28.0)), 1)

        key_drivers = self._build_key_drivers(components)
        risks = self._build_risks(
            daily_frame,
            backtest_result.metrics.max_drawdown_pct,
            weighted_score,
            model_result.validation_accuracy_pct,
            model_result.walk_forward,
        )
        summary = self._build_summary(symbol, market_overview.display_name or symbol, direction, confidence_pct, model_result, strategy)

        return AIOutlookResponse(
            model_name=self.model_name,
            horizon="Next 1 to 3 weeks",
            direction=direction,
            freshness_status=self._freshness_status_for_market(market_overview.market),
            generated_at=generated_at,
            confidence_pct=confidence_pct,
            upside_probability_pct=upside_probability_pct,
            metrics=AssetModelMetricsResponse(
                validation_accuracy_pct=round(model_result.validation_accuracy_pct, 1),
                walk_forward_accuracy_pct=round(model_result.walk_forward.accuracy_pct, 1),
                walk_forward_precision_pct=round(model_result.walk_forward.precision_pct, 1),
                average_bullish_return_pct=round(model_result.walk_forward.average_bullish_return_pct, 2),
                training_samples=model_result.training_samples,
                walk_forward_windows=model_result.walk_forward.windows,
            ),
            feature_importance=model_result.feature_importance,
            prediction_history=model_result.prediction_history,
            validation_windows=[
                ValidationWindowResponse(
                    window_label=window.window_label,
                    accuracy_pct=round(window.accuracy_pct, 1),
                    precision_pct=round(window.precision_pct, 1),
                )
                for window in model_result.walk_forward.history
            ],
            summary=summary,
            components=[
                OutlookComponentResponse(
                    name=component.name,
                    label=component.label,
                    score=component.score,
                    signal=component.signal,
                    explanation=component.explanation,
                )
                for component in components
            ],
            key_drivers=key_drivers,
            risks=risks,
            disclaimer=(
                "This trained model learns from historical weekly price and volume features for the selected asset. "
                "Its output is still probabilistic, not guaranteed, and should be used as decision support rather than financial advice."
            ),
        )

    def _ml_component(self, model_result: ModelTrainingResult) -> ComponentResult:
        raw_score = (model_result.probability_up - 0.5) * 2.0
        return ComponentResult(
            name="ml_model",
            label="Trained ML Model",
            raw_score=max(-1.0, min(1.0, raw_score)),
            explanation=model_result.explanation,
        )

    def _technical_component(self, daily_frame: pd.DataFrame) -> ComponentResult:
        closes = daily_frame["close"]
        current_close = float(closes.iloc[-1])
        sma20 = float(closes.rolling(20).mean().iloc[-1])
        sma50 = float(closes.rolling(50).mean().iloc[-1])
        ema20 = float(closes.ewm(span=20, adjust=False).mean().iloc[-1])
        rsi14 = self._compute_rsi(closes, 14)

        score = 0.0
        score += 0.35 if current_close > sma20 else -0.35
        score += 0.25 if sma20 > sma50 else -0.25
        score += 0.20 if current_close > ema20 else -0.20
        if 52 <= rsi14 <= 68:
            score += 0.20
        elif rsi14 >= 75:
            score -= 0.10
        elif rsi14 <= 35:
            score += 0.08

        return ComponentResult(
            name="technical",
            label="Technical Structure",
            raw_score=max(-1.0, min(1.0, score)),
            explanation=(
                f"Price is {'above' if current_close > sma20 else 'below'} the 20-day average, the 20-day trend is "
                f"{'leading' if sma20 > sma50 else 'lagging'} the 50-day trend, and RSI sits at {rsi14:.1f}."
            ),
        )

    def _sentiment_component(self, daily_frame: pd.DataFrame, latest_signal: str) -> ComponentResult:
        closes = daily_frame["close"]
        one_day = self._pct_change(closes, 1)
        five_day = self._pct_change(closes, 5)
        twenty_day = self._pct_change(closes, 20)
        streak = self._close_streak(closes)

        score = 0.0
        score += max(-0.25, min(0.25, five_day / 20.0))
        score += max(-0.25, min(0.25, twenty_day / 35.0))
        score += max(-0.15, min(0.15, one_day / 6.0))
        score += 0.12 if latest_signal == "BUY" else -0.05
        score += max(-0.12, min(0.12, streak * 0.04))

        return ComponentResult(
            name="sentiment",
            label="Sentiment Proxy",
            raw_score=max(-1.0, min(1.0, score)),
            explanation=(
                f"Short-term tape shows {one_day:.2f}% over 1 day, {five_day:.2f}% over 5 days, and {twenty_day:.2f}% over 20 days, "
                f"while the weekly strategy signal is {latest_signal}."
            ),
        )

    def _whale_component(self, daily_frame: pd.DataFrame) -> ComponentResult:
        closes = daily_frame["close"]
        quote_volume = daily_frame["quote_volume"].where(daily_frame["quote_volume"] > 0, daily_frame["volume"] * closes)
        latest_volume = float(quote_volume.iloc[-1])
        average_volume = float(quote_volume.tail(20).mean()) if len(quote_volume) >= 20 else float(quote_volume.mean())
        volume_ratio = (latest_volume / average_volume) if average_volume else 1.0
        price_move = self._pct_change(closes, 1)

        score = 0.0
        if volume_ratio >= 1.8 and price_move > 0:
            score = 0.65
        elif volume_ratio >= 1.8 and price_move < 0:
            score = -0.65
        elif volume_ratio >= 1.25 and price_move > 0:
            score = 0.30
        elif volume_ratio >= 1.25 and price_move < 0:
            score = -0.30
        else:
            score = 0.05 if price_move >= 0 else -0.05

        activity_label = "accumulation" if score > 0.18 else "distribution" if score < -0.18 else "balanced flow"
        return ComponentResult(
            name="whale",
            label="Whale / Flow Pressure",
            raw_score=score,
            explanation=(
                f"Latest quote volume is {volume_ratio:.2f}x the 20-session average, suggesting {activity_label} rather than quiet participation."
            ),
        )

    def _risk_component(self, weekly_bars: pd.DataFrame, win_rate_pct: float, max_drawdown_pct: float) -> ComponentResult:
        closes = weekly_bars["close"].astype(float)
        twelve_week_return = self._pct_change(closes, 12)
        weekly_volatility = float(closes.pct_change().tail(12).std(ddof=0) * 100)

        score = 0.0
        score += max(-0.35, min(0.35, twelve_week_return / 40.0))
        score += max(-0.25, min(0.25, (win_rate_pct - 50.0) / 50.0))
        score += max(-0.25, min(0.25, (18.0 - max_drawdown_pct) / 36.0))
        score += max(-0.15, min(0.15, (6.0 - weekly_volatility) / 12.0))

        return ComponentResult(
            name="risk",
            label="Risk Regime",
            raw_score=max(-1.0, min(1.0, score)),
            explanation=(
                f"The last 12 weeks returned {twelve_week_return:.2f}%, weekly volatility is {weekly_volatility:.2f}%, "
                f"and backtest drawdown sits near {max_drawdown_pct:.2f}%."
            ),
        )

    def _train_weekly_model(self, weekly_bars: pd.DataFrame, latest_signal: str) -> ModelTrainingResult:
        feature_columns = self._feature_columns()
        features = self._build_weekly_features(weekly_bars)
        supervised_frame = features.dropna(subset=feature_columns + ["target_up"]).copy()
        latest_feature_row = features.dropna(subset=feature_columns).tail(1).copy()
        model_frame = supervised_frame
        if len(model_frame) < 35:
            raise ValueError("Not enough weekly history is available to train the ML model.")

        split_index = max(24, int(len(model_frame) * 0.8))
        split_index = min(split_index, len(model_frame) - 1)

        train_frame = model_frame.iloc[:split_index].copy()
        validation_frame = model_frame.iloc[split_index:].copy()
        if validation_frame.empty:
            validation_frame = model_frame.iloc[-1:].copy()
            train_frame = model_frame.iloc[:-1].copy()

        weights, bias, means, stds = self._fit_model(train_frame, feature_columns)
        x_validation_scaled = self._scale_matrix(validation_frame[feature_columns].to_numpy(dtype=float), means, stds)
        y_validation = validation_frame["target_up"].to_numpy(dtype=float)
        validation_probabilities = self._sigmoid(np.dot(x_validation_scaled, weights) + bias)
        validation_predictions = (validation_probabilities >= 0.5).astype(float)
        validation_accuracy_pct = float((validation_predictions == y_validation).mean() * 100.0)
        latest_vector = self._scale_matrix(latest_feature_row[feature_columns].to_numpy(dtype=float), means, stds)
        probability_up = float(self._sigmoid(np.dot(latest_vector, weights) + bias)[0])
        walk_forward = self._walk_forward_validate(model_frame, feature_columns)
        feature_importance = self._build_feature_importance(weights, feature_columns)
        prediction_history = self._build_prediction_history(features, feature_columns, means, stds, weights, bias)

        latest_target = "BUY" if probability_up >= 0.55 else "CASH" if probability_up <= 0.45 else latest_signal
        explanation = (
            f"A trained weekly logistic regression used {len(train_frame)} training samples and scored "
            f"{validation_accuracy_pct:.1f}% on the holdout set. Walk-forward testing over {walk_forward.windows} windows delivered "
            f"{walk_forward.accuracy_pct:.1f}% accuracy, and the model currently assigns a {probability_up * 100:.1f}% probability "
            f"that the next week closes higher, which aligns to a {latest_target} stance."
        )

        return ModelTrainingResult(
            probability_up=probability_up,
            validation_accuracy_pct=validation_accuracy_pct,
            training_samples=len(train_frame),
            walk_forward=walk_forward,
            feature_importance=feature_importance,
            prediction_history=prediction_history,
            explanation=explanation,
        )

    def _build_weekly_features(self, weekly_bars: pd.DataFrame) -> pd.DataFrame:
        frame = weekly_bars.copy()
        closes = frame["close"].astype(float)
        volumes = frame["volume"].astype(float)

        frame["return_1w"] = closes.pct_change(1)
        frame["return_2w"] = closes.pct_change(2)
        frame["return_4w"] = closes.pct_change(4)
        frame["return_8w"] = closes.pct_change(8)
        frame["return_12w"] = closes.pct_change(12)
        frame["sma_4_gap"] = closes / closes.rolling(4).mean() - 1.0
        frame["sma_12_gap"] = closes / closes.rolling(12).mean() - 1.0
        frame["rsi_6"] = self._compute_rsi_series(closes, 6) / 100.0
        frame["volatility_4w"] = closes.pct_change().rolling(4).std(ddof=0)
        frame["volume_ratio_4w"] = volumes / volumes.rolling(4).mean()
        frame["weekly_signal_hint"] = np.where(frame["return_4w"] > 0, 1.0, 0.0)
        next_close = closes.shift(-1)
        frame["target_up"] = np.where(next_close.notna(), np.where(next_close > closes, 1.0, 0.0), np.nan)
        frame["next_week_return"] = closes.shift(-1) / closes - 1.0
        return frame

    def _feature_columns(self) -> list[str]:
        return [
            "return_1w",
            "return_2w",
            "return_4w",
            "return_8w",
            "return_12w",
            "sma_4_gap",
            "sma_12_gap",
            "rsi_6",
            "volatility_4w",
            "volume_ratio_4w",
            "weekly_signal_hint",
        ]

    def _fit_model(self, train_frame: pd.DataFrame, feature_columns: list[str]) -> tuple[np.ndarray, float, np.ndarray, np.ndarray]:
        x_train = train_frame[feature_columns].to_numpy(dtype=float)
        y_train = train_frame["target_up"].to_numpy(dtype=float)
        means = x_train.mean(axis=0)
        stds = x_train.std(axis=0)
        stds = np.where(stds < 1e-8, 1.0, stds)
        x_train_scaled = self._scale_matrix(x_train, means, stds)
        weights, bias = self._fit_logistic_regression(x_train_scaled, y_train)
        return weights, bias, means, stds

    def _scale_matrix(self, values: np.ndarray, means: np.ndarray, stds: np.ndarray) -> np.ndarray:
        return (values - means) / stds

    def _walk_forward_validate(self, model_frame: pd.DataFrame, feature_columns: list[str]) -> WalkForwardResult:
        min_train_size = 36
        test_window = 8
        accuracies: list[float] = []
        precisions: list[float] = []
        bullish_returns: list[float] = []
        history: list[WalkForwardWindow] = []
        windows = 0

        for split_end in range(min_train_size, len(model_frame) - 1, test_window):
            train_frame = model_frame.iloc[:split_end].copy()
            test_frame = model_frame.iloc[split_end : split_end + test_window].copy()
            if len(test_frame) < 2:
                continue

            weights, bias, means, stds = self._fit_model(train_frame, feature_columns)
            x_test_scaled = self._scale_matrix(test_frame[feature_columns].to_numpy(dtype=float), means, stds)
            y_test = test_frame["target_up"].to_numpy(dtype=float)
            probabilities = self._sigmoid(np.dot(x_test_scaled, weights) + bias)
            predictions = (probabilities >= 0.5).astype(float)
            accuracy_pct = float((predictions == y_test).mean() * 100.0)
            accuracies.append(accuracy_pct)

            if predictions.sum() > 0:
                positive_truth = y_test[predictions == 1.0]
                precision_pct = float((positive_truth == 1.0).mean() * 100.0)
                precisions.append(precision_pct)
                bullish_returns.extend((test_frame.loc[predictions == 1.0, "next_week_return"].dropna() * 100.0).tolist())
            else:
                precision_pct = 0.0
                precisions.append(0.0)

            history.append(
                WalkForwardWindow(
                    window_label=f"W{windows + 1}",
                    accuracy_pct=accuracy_pct,
                    precision_pct=precision_pct,
                )
            )
            windows += 1

        if windows == 0:
            return WalkForwardResult(accuracy_pct=0.0, precision_pct=0.0, average_bullish_return_pct=0.0, windows=0, history=[])

        return WalkForwardResult(
            accuracy_pct=float(np.mean(accuracies)),
            precision_pct=float(np.mean(precisions)),
            average_bullish_return_pct=float(np.mean(bullish_returns)) if bullish_returns else 0.0,
            windows=windows,
            history=history,
        )

    def _build_feature_importance(self, weights: np.ndarray, feature_columns: list[str]) -> list[FeatureImportanceResponse]:
        absolute_weights = np.abs(weights)
        total = float(absolute_weights.sum())
        if total <= 1e-9:
            normalized = np.ones_like(absolute_weights) / len(absolute_weights)
        else:
            normalized = absolute_weights / total

        importance_rows = [
            FeatureImportanceResponse(
                feature=feature,
                label=FEATURE_LABELS.get(feature, feature),
                importance_pct=round(float(value * 100.0), 1),
            )
            for feature, value in zip(feature_columns, normalized, strict=False)
        ]
        importance_rows.sort(key=lambda item: item.importance_pct, reverse=True)
        return importance_rows[:6]

    def _build_prediction_history(
        self,
        model_frame: pd.DataFrame,
        feature_columns: list[str],
        means: np.ndarray,
        stds: np.ndarray,
        weights: np.ndarray,
        bias: float,
    ) -> list[PredictionHistoryPointResponse]:
        recent_frame = model_frame.dropna(subset=feature_columns).tail(8).copy()
        x_recent = self._scale_matrix(recent_frame[feature_columns].to_numpy(dtype=float), means, stds)
        probabilities = self._sigmoid(np.dot(x_recent, weights) + bias)

        history: list[PredictionHistoryPointResponse] = []
        for row, probability in zip(recent_frame.itertuples(), probabilities, strict=False):
            point_date = row.Index.date() if hasattr(row.Index, "date") else date.today()
            actual_up = None if pd.isna(row.target_up) else bool(int(row.target_up))
            realized_return = None if pd.isna(row.next_week_return) else float(row.next_week_return * 100.0)
            history.append(
                PredictionHistoryPointResponse(
                    point_date=point_date,
                    probability_up_pct=round(float(probability * 100.0), 1),
                    actual_up=actual_up,
                    realized_return_pct=round(realized_return, 2) if realized_return is not None else None,
                )
            )
        return history

    def _fit_logistic_regression(self, x_train: np.ndarray, y_train: np.ndarray) -> tuple[np.ndarray, float]:
        weights = np.zeros(x_train.shape[1], dtype=float)
        bias = 0.0
        learning_rate = 0.08
        regularization = 0.002
        sample_count = max(1, len(y_train))

        for _ in range(1200):
            logits = np.dot(x_train, weights) + bias
            predictions = self._sigmoid(logits)
            error = predictions - y_train
            gradient_w = (np.dot(x_train.T, error) / sample_count) + regularization * weights
            gradient_b = float(error.mean())
            weights -= learning_rate * gradient_w
            bias -= learning_rate * gradient_b

        return weights, bias

    def _sigmoid(self, values: np.ndarray) -> np.ndarray:
        clipped = np.clip(values, -35.0, 35.0)
        return 1.0 / (1.0 + np.exp(-clipped))

    def _build_key_drivers(self, components: list[ComponentResult]) -> list[str]:
        ranked = sorted(components, key=lambda component: abs(component.raw_score), reverse=True)
        return [component.explanation for component in ranked[:3]]

    def _build_risks(
        self,
        daily_frame: pd.DataFrame,
        max_drawdown_pct: float,
        weighted_score: float,
        validation_accuracy_pct: float,
        walk_forward: WalkForwardResult,
    ) -> list[str]:
        closes = daily_frame["close"]
        rsi14 = self._compute_rsi(closes, 14)
        risks: list[str] = []

        if validation_accuracy_pct < 55:
            risks.append(f"The model holdout accuracy is {validation_accuracy_pct:.1f}%, so the edge is modest and should be treated carefully.")
        if walk_forward.accuracy_pct < 55:
            risks.append(f"Walk-forward accuracy is {walk_forward.accuracy_pct:.1f}%, so live robustness is still limited.")
        if rsi14 >= 72:
            risks.append(f"RSI is elevated at {rsi14:.1f}, so short-term upside may arrive with pullback risk.")
        if max_drawdown_pct >= 18:
            risks.append(f"Backtest drawdown is {max_drawdown_pct:.1f}%, which means the setup has historically been choppy.")
        if abs(weighted_score) < 0.2:
            risks.append("Factor alignment is mixed, so the setup is closer to a wait-and-watch regime than a strong conviction trade.")
        if not risks:
            risks.append("No single risk is dominant right now, but this is still a probability view and not a guaranteed move.")
        return risks[:3]

    def _build_summary(
        self,
        symbol: str,
        display_name: str,
        direction: OutlookDirection,
        confidence_pct: float,
        model_result: ModelTrainingResult,
        strategy: StrategyName,
    ) -> str:
        direction_text = {
            OutlookDirection.bullish: "bullish bias",
            OutlookDirection.neutral: "balanced to neutral bias",
            OutlookDirection.bearish: "bearish bias",
        }[direction]
        return (
            f"For {display_name} ({symbol}), the trained weekly model plus explainable market factors point to a {direction_text} "
            f"over the next 1 to 3 weeks with {confidence_pct:.1f}% confidence. The model learned from {model_result.training_samples} "
            f"historical weekly samples, achieved {model_result.validation_accuracy_pct:.1f}% holdout accuracy, and delivered "
            f"{model_result.walk_forward.accuracy_pct:.1f}% walk-forward accuracy across {model_result.walk_forward.windows} rolling windows while being cross-checked with the weekly {strategy.value.replace('_', ' ')} strategy."
        )

    def _freshness_status_for_market(self, market: str) -> str:
        return "Live" if market == "Binance Spot" else "Delayed"

    def _direction_from_score(self, score: float) -> OutlookDirection:
        if score > 0.18:
            return OutlookDirection.bullish
        if score < -0.18:
            return OutlookDirection.bearish
        return OutlookDirection.neutral

    def _compute_rsi(self, closes: pd.Series, period: int) -> float:
        series = self._compute_rsi_series(closes, period)
        latest = series.iloc[-1]
        if pd.isna(latest):
            return 50.0
        return float(latest)

    def _compute_rsi_series(self, closes: pd.Series, period: int) -> pd.Series:
        delta = closes.diff().fillna(0.0)
        gains = delta.clip(lower=0)
        losses = (-delta.clip(upper=0)).astype(float)
        average_gain = gains.ewm(alpha=1 / period, adjust=False).mean()
        average_loss = losses.ewm(alpha=1 / period, adjust=False).mean()
        rs = average_gain / (average_loss + 1e-9)
        rsi = 100 - (100 / (1 + rs))
        return rsi.clip(lower=0, upper=100)

    def _pct_change(self, series: pd.Series, periods: int) -> float:
        if len(series) <= periods:
            return 0.0
        previous = float(series.iloc[-(periods + 1)])
        current = float(series.iloc[-1])
        if previous == 0:
            return 0.0
        return ((current - previous) / previous) * 100.0

    def _close_streak(self, closes: pd.Series) -> int:
        streak = 0
        for index in range(len(closes) - 1, 0, -1):
            if closes.iloc[index] > closes.iloc[index - 1]:
                if streak < 0:
                    break
                streak += 1
            elif closes.iloc[index] < closes.iloc[index - 1]:
                if streak > 0:
                    break
                streak -= 1
            else:
                break
        return streak
