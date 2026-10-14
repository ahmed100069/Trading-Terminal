from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.trading import (
    AIOutlookResponse,
    AssetModelMetricsResponse,
    FeatureImportanceResponse,
    MarketOverviewResponse,
    OutlookDirection,
    PredictionHistoryPointResponse,
    ValidationWindowResponse,
)
from app.services.monitoring_service import MarketMonitoringService


def _ai_outlook(direction: OutlookDirection = OutlookDirection.bullish) -> AIOutlookResponse:
    return AIOutlookResponse(
        model_name="Test Model",
        horizon="Next 1 week",
        direction=direction,
        freshness_status="live",
        generated_at=datetime.now(timezone.utc),
        confidence_pct=78.0,
        upside_probability_pct=72.0,
        metrics=AssetModelMetricsResponse(
            validation_accuracy_pct=70.0,
            walk_forward_accuracy_pct=68.0,
            walk_forward_precision_pct=66.0,
            average_bullish_return_pct=3.5,
            training_samples=120,
            walk_forward_windows=6,
        ),
        feature_importance=[
            FeatureImportanceResponse(feature="momentum", label="Momentum", importance_pct=40.0),
            FeatureImportanceResponse(feature="volatility", label="Volatility", importance_pct=26.0),
        ],
        prediction_history=[
            PredictionHistoryPointResponse(
                point_date=datetime.now(timezone.utc).date(),
                probability_up_pct=72.0,
                actual_up=True,
                realized_return_pct=1.2,
            )
        ],
        validation_windows=[
            ValidationWindowResponse(window_label="Q1", accuracy_pct=72.0, precision_pct=70.0),
        ],
        summary="The market remains constructive.",
        components=[],
        key_drivers=["momentum", "volatility"],
        risks=["Monitor for reversal"],
        disclaimer="This is decision support only.",
    )


def _market_overview() -> MarketOverviewResponse:
    return MarketOverviewResponse(
        symbol="BTCUSDT",
        display_name="Bitcoin",
        market="Binance Spot",
        asset_class="crypto",
        last_price=100000.0,
        price_change=1200.0,
        price_change_percent=1.2,
        weighted_avg_price=99500.0,
        high_price=101000.0,
        low_price=98000.0,
        volume=2500.0,
        quote_volume=250000000.0,
        bid_price=99950.0,
        ask_price=100050.0,
        open_time=datetime.now(timezone.utc),
        close_time=datetime.now(timezone.utc),
        trade_count=150,
    )


def test_monitoring_snapshot_risk_and_probability_are_computed() -> None:
    monitoring = MarketMonitoringService()

    snapshot = monitoring.build_snapshot(
        market=_market_overview(),
        ai_outlook=_ai_outlook(),
        timeframe="1-3w",
    )

    assert snapshot["symbol"] == "BTCUSDT"
    assert snapshot["timeframe"] == "1-3w"
    assert snapshot["direction"] == "LONG"
    assert 0.0 <= snapshot["probability"] <= 1.0
    assert snapshot["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
    assert snapshot["anomaly_status"] in {"NORMAL", "WATCH", "ALERT"}


def test_monitoring_snapshot_handles_missing_data_cleanly() -> None:
    monitoring = MarketMonitoringService()

    snapshot = monitoring.build_snapshot(
        market=None,
        ai_outlook=None,
        timeframe="1-3w",
    )

    assert snapshot["status"] == "UNAVAILABLE"
    assert "reason" in snapshot
