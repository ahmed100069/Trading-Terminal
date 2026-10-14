from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from app.schemas.trading import AIOutlookResponse, MarketOverviewResponse


class MarketMonitoringService:
    def build_snapshot(
        self,
        market: MarketOverviewResponse | None = None,
        ai_outlook: AIOutlookResponse | None = None,
        timeframe: str = "1-3w",
    ) -> dict[str, Any]:
        if market is None or ai_outlook is None:
            return {
                "status": "UNAVAILABLE",
                "reason": "Insufficient market or model data to compute a live snapshot.",
                "symbol": "",
                "timeframe": timeframe,
                "direction": "NEUTRAL",
                "probability": 0.0,
                "risk_level": "LOW",
                "risk_score": 0.0,
                "anomaly_status": "NORMAL",
                "anomaly_score": 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        direction = self._direction_from_outlook(ai_outlook.direction)
        upside_probability = ai_outlook.upside_probability_pct / 100.0
        probability = (
            upside_probability
            if direction == "LONG"
            else 1.0 - upside_probability
            if direction == "SHORT"
            else 0.5
        )

        risk_score = min(
            1.0,
            abs(market.price_change_percent) / 10.0 * 0.45
            + max(0.0, 1.0 - probability) * 0.35
            + (0.2 if abs(market.price_change_percent) > 4.0 else 0.05),
        )
        risk_level = self._risk_level_from_score(risk_score)

        anomaly_score = min(
            1.0,
            abs(market.price_change_percent) / 12.0 * 0.4
            + max(0.0, 0.6 - probability) * 0.45
            + (0.2 if market.volume > 0 and market.quote_volume > 0 else 0.0),
        )
        anomaly_status = self._anomaly_status_from_score(anomaly_score)

        return {
            "status": "READY",
            "symbol": market.symbol,
            "timeframe": timeframe,
            "direction": direction,
            "probability": round(probability, 4),
            "risk_level": risk_level,
            "risk_score": round(risk_score, 4),
            "anomaly_status": anomaly_status,
            "anomaly_score": round(anomaly_score, 4),
            "model_confidence_pct": round(ai_outlook.confidence_pct, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def build_system_health(
        self,
        *,
        market: MarketOverviewResponse | None = None,
        ai_outlook: AIOutlookResponse | None = None,
        database_status: str = "UNKNOWN",
        backend_latency_ms: int = 0,
        prediction_latency_ms: int = 0,
    ) -> dict[str, Any]:
        # The current app's Binance WebSocket is owned by the browser chart, not
        # by this API process, so the backend cannot truthfully report its state.
        binance_ws = "NOT_TRACKED"
        model_status = "LIVE" if ai_outlook is not None else "UNAVAILABLE"
        redis_status = "CONFIGURED" if os.getenv("REDIS_URL") else "NOT_CONFIGURED"
        required_services_ready = market is not None and ai_outlook is not None and database_status == "LIVE"
        status = "LIVE" if required_services_ready else "DEGRADED"
        data_delay_ms = 0
        if market is not None:
            market_timestamp = market.close_time
            if market_timestamp.tzinfo is None:
                market_timestamp = market_timestamp.replace(tzinfo=timezone.utc)
            data_delay_ms = max(
                0,
                int((datetime.now(timezone.utc) - market_timestamp).total_seconds() * 1000),
            )

        return {
            "status": status,
            "binance_ws": binance_ws,
            "redis": redis_status,
            "database": database_status,
            "model": model_status,
            "health_status": status,
            "latency_ms": backend_latency_ms,
            "prediction_latency_ms": prediction_latency_ms,
            "data_delay_ms": data_delay_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _direction_from_outlook(self, direction: str) -> str:
        direction_value = getattr(direction, "value", direction)
        direction_key = str(direction_value).lower()
        if direction_key == "bullish":
            return "LONG"
        if direction_key == "bearish":
            return "SHORT"
        return "NEUTRAL"

    def _risk_level_from_score(self, score: float) -> str:
        if score >= 0.7:
            return "HIGH"
        if score >= 0.4:
            return "MEDIUM"
        return "LOW"

    def _anomaly_status_from_score(self, score: float) -> str:
        if score >= 0.75:
            return "ALERT"
        if score >= 0.45:
            return "WATCH"
        return "NORMAL"
