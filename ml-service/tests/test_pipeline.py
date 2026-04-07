from __future__ import annotations

import json
from pathlib import Path

from app.feature_config import MODEL_LABELS
from app.synthetic_data import generate_synthetic_corpus
from app.training import train_and_select_model
from app.model_bundle import load_model_bundle, predict_from_features


def test_generator_is_deterministic_and_balanced() -> None:
    corpus_a = generate_synthetic_corpus(num_child_weeks=600, seed=7)
    corpus_b = generate_synthetic_corpus(num_child_weeks=600, seed=7)

    assert corpus_a.weekly_dataset.equals(corpus_b.weekly_dataset)
    assert corpus_a.raw_logs.equals(corpus_b.raw_logs)
    assert 590 <= len(corpus_a.weekly_dataset) <= 600
    assert 3600 <= len(corpus_a.raw_logs) <= 6500

    labels = set(corpus_a.weekly_dataset['target'].unique().tolist())
    assert labels == set(MODEL_LABELS)


def test_cleaning_reduces_raw_noise() -> None:
    corpus = generate_synthetic_corpus(num_child_weeks=400, seed=11)
    assert len(corpus.raw_logs) > len(corpus.weekly_dataset)
    assert (corpus.raw_logs['durationMinutes'] == 0).sum() > 0
    assert corpus.weekly_dataset['weekly_log_count'].min() >= 1


def test_training_emits_artifacts_and_predicts(tmp_path: Path) -> None:
    corpus = generate_synthetic_corpus(num_child_weeks=900, seed=13)
    artifacts_dir = tmp_path / 'artifacts'
    reports_dir = tmp_path / 'reports'

    metrics = train_and_select_model(corpus.weekly_dataset, artifacts_dir, reports_dir, random_state=13)

    assert (artifacts_dir / 'model.joblib').exists()
    assert (artifacts_dir / 'feature_schema.json').exists()
    assert (artifacts_dir / 'label_mapping.json').exists()
    assert (artifacts_dir / 'metrics.json').exists()
    assert (artifacts_dir / 'model_version.txt').exists()
    assert (reports_dir / 'training_metrics.json').exists()
    assert (reports_dir / 'training_report.md').exists()
    assert (artifacts_dir / 'model.joblib').stat().st_size < 10 * 1024 * 1024

    selected_model = metrics['selectedModel']
    assert selected_model in {'random_forest', 'svm', 'hybrid_rf'}
    assert metrics['models'][selected_model]['test']['macro_f1'] >= 0.8

    bundle = load_model_bundle(artifacts_dir)
    sample = corpus.weekly_dataset.iloc[0]
    features = {column: float(sample[column]) for column in bundle.feature_columns}
    prediction = predict_from_features(bundle, features)

    assert bundle.labels == list(bundle.model.classes_)
    assert prediction['status'] in MODEL_LABELS
    assert 0 <= prediction['confidence'] <= 1
    assert len(prediction['classProbabilities']) == 3
    assert prediction['topRiskFactors']
