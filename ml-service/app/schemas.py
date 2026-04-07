from __future__ import annotations

from typing import Dict

from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):
    features: Dict[str, float] = Field(default_factory=dict)


class PredictionResponse(BaseModel):
    status: str
    confidence: float
    classProbabilities: Dict[str, float]
    topRiskFactors: list[str]
    modelName: str
    modelVersion: str
