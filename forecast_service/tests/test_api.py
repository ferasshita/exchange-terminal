from __future__ import annotations

from typing import Any

import random
from datetime import datetime, timedelta, timezone


def _make_synthetic_payload() -> dict[str, list[dict[str, Any]]]:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    hours = 72
    times = [now - timedelta(hours=h) for h in range(hours, 0, -1)]

    def mk_series(code: str, base: float) -> list[dict[str, Any]]:
        rate = base
        out = []
        for t in times:
            rate += random.uniform(-0.1, 0.1)
            out.append({
                "currencyCode": code,
                "timestamp": t.isoformat(),
                "rate": round(rate, 4)
            })
        return out

    rates = mk_series("USD-LYD", 5.0) + mk_series("EUR-LYD", 5.3)

    news = [
        {
            "timestamp": (now - timedelta(hours=6)).isoformat(),
            "text": "الدولار يرتفع في السوق الموازي المصرف المركزي ليبيا",
        },
        {
            "timestamp": (now - timedelta(hours=30)).isoformat(),
            "text": "تحديث اقتصادي ليبيا الدينار",
        },
    ]

    return {"rates": rates, "news": news}


def test_train_endpoint_returns_predictions(client) -> None:
    payload = _make_synthetic_payload()
    res = client.post("/train", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "modelVersion" in data
    assert isinstance(data["predictions"], list)
    # Expect some predictions for both pairs and 2 horizons each
    assert len(data["predictions"]) >= 2
    for item in data["predictions"]:
        assert set(["pair", "horizonHours", "pointForecast", "confidenceLow", "confidenceHigh", "confidenceLabel", "currentRate", "predictionFor"]).issubset(item.keys())


def test_predict_endpoint_aliases_train(client) -> None:
    payload = _make_synthetic_payload()
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "modelVersion" in data
    assert isinstance(data["predictions"], list)
