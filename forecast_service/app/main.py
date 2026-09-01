from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .pipeline import train_models


class TrainPayload(BaseModel):
    rates: list[dict]
    news: list[dict]


class PredictPayload(BaseModel):
    rates: list[dict]
    news: list[dict]


app = FastAPI(title="Forecast Service", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/train")
def train(payload: TrainPayload) -> dict:
    try:
        model_version, predictions = train_models(payload.rates, payload.news)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"modelVersion": model_version, "predictions": predictions}


@app.post("/predict")
def predict(payload: PredictPayload) -> dict:
    try:
        model_version, predictions = train_models(payload.rates, payload.news)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"modelVersion": model_version, "predictions": predictions}
