from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException

from .model_bundle import ModelBundleError, load_model_bundle, predict_from_features
from .schemas import PredictionRequest, PredictionResponse


def get_bundle_dir() -> Path:
    configured = os.getenv('ML_MODEL_BUNDLE_DIR')
    if configured:
        return Path(configured).resolve()
    return (Path(__file__).resolve().parents[1] / 'artifacts' / 'production').resolve()


@asynccontextmanager
async def lifespan(app: FastAPI):
    bundle_dir = get_bundle_dir()
    app.state.bundle_dir = bundle_dir
    app.state.model_bundle = load_model_bundle(bundle_dir)
    yield


app = FastAPI(title='SAPNA ML Inference Service', version='1.0.0', lifespan=lifespan)


@app.get('/health')
async def health() -> dict[str, object]:
    bundle = app.state.model_bundle
    return {
        'ok': True,
        'service': 'sapna-ml-api',
        'modelName': bundle.model_name,
        'modelVersion': bundle.model_version,
    }


@app.post('/predict', response_model=PredictionResponse)
async def predict(payload: PredictionRequest) -> PredictionResponse:
    try:
        prediction = predict_from_features(app.state.model_bundle, payload.features)
        return PredictionResponse(**prediction)
    except ModelBundleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
