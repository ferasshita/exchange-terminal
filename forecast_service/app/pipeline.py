from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor


def normalize_news_relevance(text: str) -> float:
    terms = ["ليبيا", "دينار", "الدولار", "اقتصاد", "عملة", "مصرف", "السوق الموازي"]
    body = text or ""
    return 0.9 if any(term in body for term in terms) else 0.1


def build_hourly_dataset(rates: pd.DataFrame, news: pd.DataFrame, currency_code: str) -> pd.DataFrame:
    pair_rates = rates[rates["currencyCode"] == currency_code].copy()
    if pair_rates.empty:
        raise ValueError(f"No rates found for {currency_code}")

    pair_rates["timestamp"] = pd.to_datetime(pair_rates["timestamp"], utc=True)
    rates_h = pair_rates.set_index("timestamp")[["rate"]].resample("h").mean().ffill().dropna()

    if news.empty:
        news_h = pd.DataFrame(index=rates_h.index, columns=["sentiment_mean", "relevance_mean", "news_count"]).fillna(0)
    else:
        news_cp = news.copy()
        news_cp["timestamp"] = pd.to_datetime(news_cp["timestamp"], utc=True)
        news_cp["relevance"] = news_cp["text"].apply(normalize_news_relevance)
        news_cp["weighted_sentiment"] = 0.0
        news_h = news_cp.set_index("timestamp").resample("h").agg(
            sentiment_mean=("weighted_sentiment", "mean"),
            relevance_mean=("relevance", "mean"),
            news_count=("text", "count"),
        )

    joined = rates_h.join(news_h, how="left")
    joined[["sentiment_mean", "relevance_mean", "news_count"]] = joined[
        ["sentiment_mean", "relevance_mean", "news_count"]
    ].fillna(0)
    return joined


def engineer_features(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    frame = df.copy()
    for lag in [1, 3, 6, 12, 24, 48]:
        frame[f"rate_lag_{lag}"] = frame["rate"].shift(lag)

    frame["rate_roll_mean_24"] = frame["rate"].rolling(24).mean()
    frame["rate_roll_std_24"] = frame["rate"].rolling(24).std()
    frame["rate_change_24"] = frame["rate"] - frame["rate"].shift(24)
    frame["news_count_roll_24"] = frame["news_count"].rolling(24).sum()
    frame["relevance_roll_mean_24"] = frame["relevance_mean"].rolling(24).mean()
    frame["hour"] = frame.index.hour
    frame["dow"] = frame.index.dayofweek

    frame["target_24h"] = frame["rate"].shift(-24)
    frame["target_48h"] = frame["rate"].shift(-48)

    feature_cols = [c for c in frame.columns if c not in ["target_24h", "target_48h", "rate"]]
    modeled = frame.dropna(subset=feature_cols + ["target_24h", "target_48h"])
    return modeled, feature_cols


@dataclass
class ModelBundle:
    pair: str
    feature_cols: list[str]
    model_24h: LGBMRegressor
    model_48h: LGBMRegressor
    q10_24h: LGBMRegressor
    q90_24h: LGBMRegressor
    q10_48h: LGBMRegressor
    q90_48h: LGBMRegressor
    latest_row: pd.Series


def _train_model(train_x: pd.DataFrame, train_y: pd.Series, objective: str = "regression", alpha: float | None = None):
    kwargs: dict[str, Any] = {}
    if objective == "quantile":
        kwargs["objective"] = "quantile"
        kwargs["alpha"] = alpha
    model = LGBMRegressor(n_estimators=200, learning_rate=0.05, max_depth=5, verbosity=-1, **kwargs)
    model.fit(train_x, train_y)
    return model


def train_models(rates_payload: list[dict[str, Any]], news_payload: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    rates = pd.DataFrame(rates_payload)
    news = pd.DataFrame(news_payload)
    if rates.empty:
        raise ValueError("No rates payload provided")

    predictions: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    for pair in sorted(rates["currencyCode"].unique()):
        hourly = build_hourly_dataset(rates, news, pair)
        modeled, feature_cols = engineer_features(hourly)
        if len(modeled) < 10:
            continue

        split = max(5, int(len(modeled) * 0.8))
        train = modeled.iloc[:split]
        latest = modeled.iloc[-1]

        x = train[feature_cols]
        m24 = _train_model(x, train["target_24h"])
        m48 = _train_model(x, train["target_48h"])
        q10_24 = _train_model(x, train["target_24h"], objective="quantile", alpha=0.10)
        q90_24 = _train_model(x, train["target_24h"], objective="quantile", alpha=0.90)
        q10_48 = _train_model(x, train["target_48h"], objective="quantile", alpha=0.10)
        q90_48 = _train_model(x, train["target_48h"], objective="quantile", alpha=0.90)

        row = latest[feature_cols].to_frame().T
        current_rate = float(latest["rate"])

        for horizon, point_m, low_m, high_m, hours in [
            ("24h", m24, q10_24, q90_24, 24),
            ("48h", m48, q10_48, q90_48, 48),
        ]:
            point = float(point_m.predict(row)[0])
            low = float(low_m.predict(row)[0])
            high = float(high_m.predict(row)[0])
            lo, hi = (low, high) if low <= high else (high, low)
            width_pct = ((hi - lo) / point * 100) if point else 0.0
            label = "High" if width_pct < 0.5 else "Medium" if width_pct < 1.5 else "Low"
            predictions.append(
                {
                    "pair": pair,
                    "horizonHours": hours,
                    "pointForecast": round(point, 6),
                    "confidenceLow": round(lo, 6),
                    "confidenceHigh": round(hi, 6),
                    "confidenceLabel": label,
                    "currentRate": round(current_rate, 6),
                    "predictionFor": (now + timedelta(hours=hours)).isoformat(),
                }
            )

    model_version = now.strftime("model-%Y%m%d%H%M%S")
    return model_version, predictions
