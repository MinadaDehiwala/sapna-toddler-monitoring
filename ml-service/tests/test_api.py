from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.synthetic_data import generate_synthetic_corpus
from app.training import train_and_select_model


def test_api_health_and_predict(tmp_path: Path, monkeypatch) -> None:
    artifacts_dir = tmp_path / 'artifacts'
    reports_dir = tmp_path / 'reports'
    corpus = generate_synthetic_corpus(num_child_weeks=500, seed=17)
    train_and_select_model(corpus.weekly_dataset, artifacts_dir, reports_dir, random_state=17)

    monkeypatch.setenv('ML_MODEL_BUNDLE_DIR', str(artifacts_dir))
    from app.main import app

    sample = corpus.weekly_dataset.iloc[10]
    features = {
        column: float(sample[column])
        for column in corpus.weekly_dataset.columns
        if column not in {'child_id', 'week_start', 'target'}
    }

    with TestClient(app) as client:
        health = client.get('/health')
        assert health.status_code == 200
        assert health.json()['ok'] is True

        prediction = client.post('/predict', json={'features': features})
        assert prediction.status_code == 200
        body = prediction.json()
        assert body['status'] in {'on_track', 'needs_monitoring', 'at_risk'}
        assert 'modelVersion' in body
        assert len(body['topRiskFactors']) >= 1

        invalid = client.post('/predict', json={'features': {'age_in_months': 24}})
        assert invalid.status_code == 400
