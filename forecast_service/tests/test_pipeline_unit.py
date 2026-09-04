from __future__ import annotations

import pandas as pd
import pytest

from app.pipeline import normalize_news_relevance, build_hourly_dataset


def test_normalize_news_relevance_keywords() -> None:
    assert normalize_news_relevance("الدولار يرتفع في ليبيا السوق الموازي") == pytest.approx(0.9)
    assert normalize_news_relevance("no relevant words here") == pytest.approx(0.1)


def test_build_hourly_dataset_no_rates_raises() -> None:
    rates = pd.DataFrame([{"currencyCode": "EUR-LYD", "timestamp": "2025-01-01T00:00:00Z", "rate": 5.2}])
    news = pd.DataFrame()
    with pytest.raises(ValueError):
        build_hourly_dataset(rates, news, "USD-LYD")
