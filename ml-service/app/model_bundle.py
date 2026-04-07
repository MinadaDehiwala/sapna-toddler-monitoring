from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .feature_config import FEATURE_COLUMNS, MODEL_LABELS

RISK_FACTOR_MESSAGES = {
    'overall_age_gap': 'Milestone completion this week fell below the age-adjusted expectation.',
    'language_age_gap': 'Language-focused activities appear below the expected range for this age.',
    'motor_age_gap': 'Motor development activities appear below the expected range for this age.',
    'cognitive_age_gap': 'Cognitive play outcomes appear below the expected range for this age.',
    'social_emotional_age_gap': 'Social-emotional observations appear below the expected range for this age.',
    'weekly_log_count': 'Very few parent logs were recorded this week, which lowers confidence in the screening result.',
    'engagement_consistency': 'Guided activities were not spread consistently across the week.',
    'avg_parent_confidence': 'Parent confidence in the observed activity outcomes was low.',
    'needs_help_ratio': 'A high share of activities required full support from the parent.',
}


@dataclass
class LoadedModelBundle:
    model: Any
    feature_columns: list[str]
    labels: list[str]
    model_name: str
    model_version: str


class ModelBundleError(RuntimeError):
    pass


def load_model_bundle(bundle_dir: Path) -> LoadedModelBundle:
    bundle_path = bundle_dir / 'model.joblib'
    if not bundle_path.exists():
        raise ModelBundleError(f'Model bundle not found at {bundle_path}')

    payload = joblib.load(bundle_path)
    model = payload['model']
    model_classes = list(getattr(model, 'classes_', []))
    stored_labels = list(payload.get('labels', []))
    labels = model_classes or stored_labels or MODEL_LABELS
    return LoadedModelBundle(
        model=model,
        feature_columns=list(payload.get('feature_columns', FEATURE_COLUMNS)),
        labels=labels,
        model_name=str(payload.get('model_name', 'unknown_model')),
        model_version=str(payload.get('model_version', 'unknown_version')),
    )


def _score_risk_factors(features: dict[str, float]) -> list[tuple[str, float]]:
    candidates = [
        ('overall_age_gap', max(0.0, -features.get('overall_age_gap', 0.0))),
        ('language_age_gap', max(0.0, -features.get('language_age_gap', 0.0))),
        ('motor_age_gap', max(0.0, -features.get('motor_age_gap', 0.0))),
        ('cognitive_age_gap', max(0.0, -features.get('cognitive_age_gap', 0.0))),
        ('social_emotional_age_gap', max(0.0, -features.get('social_emotional_age_gap', 0.0))),
        ('weekly_log_count', max(0.0, (3.0 - features.get('weekly_log_count', 0.0)) / 3.0)),
        ('engagement_consistency', max(0.0, 0.45 - features.get('engagement_consistency', 0.0))),
        ('avg_parent_confidence', max(0.0, 2.75 - features.get('avg_parent_confidence', 0.0)) / 2.75),
        ('needs_help_ratio', max(0.0, features.get('needs_help_ratio', 0.0) - 0.25)),
    ]
    return sorted(candidates, key=lambda item: item[1], reverse=True)


def derive_top_risk_factors(features: dict[str, float], predicted_status: str) -> list[str]:
    if predicted_status == 'on_track':
        positives = []
        if features.get('engagement_consistency', 0.0) >= 0.6:
            positives.append('Guided activities were completed consistently across the week.')
        if features.get('overall_age_gap', 0.0) >= 0:
            positives.append('Observed milestone completion met or exceeded the age-adjusted baseline.')
        if features.get('mastered_ratio', 0.0) >= 0.22:
            positives.append('Several logged activities reached a mastered outcome.')
        return positives[:3] or ['Weekly observations were broadly aligned with the expected developmental range.']

    ranked = _score_risk_factors(features)
    messages: list[str] = []
    for key, severity in ranked:
        if severity <= 0:
            continue
        message = RISK_FACTOR_MESSAGES.get(key)
        if message and message not in messages:
            messages.append(message)
        if len(messages) == 3:
            break

    return messages or ['The screening result was driven by a combination of low milestone scores and reduced activity consistency.']


def predict_from_features(bundle: LoadedModelBundle, features: dict[str, float]) -> dict[str, object]:
    missing = [feature for feature in bundle.feature_columns if feature not in features]
    if missing:
        raise ModelBundleError(f'Missing features for inference: {missing}')

    frame = pd.DataFrame([{feature: float(features[feature]) for feature in bundle.feature_columns}])
    probabilities = bundle.model.predict_proba(frame)[0]
    predicted_index = int(np.argmax(probabilities))
    predicted_status = bundle.labels[predicted_index]
    confidence = float(probabilities[predicted_index])

    probability_map = {
        label: round(float(probabilities[index]), 4)
        for index, label in enumerate(bundle.labels)
    }
    risk_factors = derive_top_risk_factors(features, predicted_status)

    return {
        'status': predicted_status,
        'confidence': round(confidence, 4),
        'classProbabilities': probability_map,
        'topRiskFactors': risk_factors,
        'modelName': bundle.model_name,
        'modelVersion': bundle.model_version,
    }
