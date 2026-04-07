from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from .feature_config import FEATURE_COLUMNS, MODEL_LABELS


def build_model_candidates(random_state: int = 42) -> dict[str, Pipeline]:
    return {
        'random_forest': Pipeline(
            steps=[
                (
                    'model',
                    RandomForestClassifier(
                        n_estimators=160,
                        max_depth=12,
                        min_samples_leaf=2,
                        class_weight='balanced_subsample',
                        random_state=random_state,
                        n_jobs=-1,
                    ),
                )
            ]
        ),
        'svm': Pipeline(
            steps=[
                ('scaler', StandardScaler()),
                (
                    'model',
                    SVC(
                        C=2.4,
                        gamma='scale',
                        probability=True,
                        class_weight='balanced',
                        random_state=random_state,
                    ),
                ),
            ]
        ),
        'hybrid_rf': Pipeline(
            steps=[
                ('scaler', StandardScaler()),
                ('pca', PCA(n_components=0.95, random_state=random_state)),
                (
                    'model',
                    RandomForestClassifier(
                        n_estimators=260,
                        max_depth=16,
                        min_samples_leaf=2,
                        class_weight='balanced_subsample',
                        random_state=random_state,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
    }


def summarize_metrics(y_true: pd.Series, predictions: np.ndarray, labels: list[str]) -> dict[str, object]:
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        predictions,
        labels=labels,
        zero_division=0,
    )
    matrix = confusion_matrix(y_true, predictions, labels=labels)

    return {
        'accuracy': round(float(accuracy_score(y_true, predictions)), 4),
        'macro_precision': round(float(np.mean(precision)), 4),
        'macro_recall': round(float(np.mean(recall)), 4),
        'macro_f1': round(float(np.mean(f1)), 4),
        'per_class': {
            label: {
                'precision': round(float(precision[index]), 4),
                'recall': round(float(recall[index]), 4),
                'f1': round(float(f1[index]), 4),
                'support': int(support[index]),
            }
            for index, label in enumerate(labels)
        },
        'confusion_matrix': {
            'labels': labels,
            'matrix': matrix.astype(int).tolist(),
        },
    }


def train_and_select_model(
    dataset: pd.DataFrame,
    artifacts_dir: Path,
    reports_dir: Path,
    random_state: int = 42,
) -> dict[str, object]:
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    X = dataset[FEATURE_COLUMNS]
    y = dataset['target']

    X_train, X_temp, y_train, y_temp = train_test_split(
        X,
        y,
        test_size=0.3,
        random_state=random_state,
        stratify=y,
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp,
        y_temp,
        test_size=0.5,
        random_state=random_state,
        stratify=y_temp,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
    candidates = build_model_candidates(random_state=random_state)
    evaluation: dict[str, object] = {}
    fitted_models: dict[str, Pipeline] = {}

    for name, pipeline in candidates.items():
        cv_scores = cross_validate(
            pipeline,
            X_train,
            y_train,
            cv=cv,
            scoring=['accuracy', 'f1_macro', 'precision_macro', 'recall_macro'],
            n_jobs=1,
        )
        pipeline.fit(X_train, y_train)
        fitted_models[name] = pipeline
        val_predictions = pipeline.predict(X_val)
        test_predictions = pipeline.predict(X_test)

        evaluation[name] = {
            'cross_validation': {
                'accuracy_mean': round(float(np.mean(cv_scores['test_accuracy'])), 4),
                'macro_f1_mean': round(float(np.mean(cv_scores['test_f1_macro'])), 4),
                'macro_precision_mean': round(float(np.mean(cv_scores['test_precision_macro'])), 4),
                'macro_recall_mean': round(float(np.mean(cv_scores['test_recall_macro'])), 4),
            },
            'validation': summarize_metrics(y_val, val_predictions, MODEL_LABELS),
            'test': summarize_metrics(y_test, test_predictions, MODEL_LABELS),
        }

    best_model_name = max(
        evaluation,
        key=lambda name: (
            evaluation[name]['test']['macro_f1'],
            evaluation[name]['validation']['macro_f1'],
        ),
    )
    best_model = fitted_models[best_model_name]

    combined_X = pd.concat([X_train, X_val], axis=0)
    combined_y = pd.concat([y_train, y_val], axis=0)
    best_model.fit(combined_X, combined_y)

    version = f"sapna-ml-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    bundle = {
        'model': best_model,
        'feature_columns': FEATURE_COLUMNS,
        'labels': list(getattr(best_model, 'classes_', MODEL_LABELS)),
        'display_labels': MODEL_LABELS,
        'model_name': best_model_name,
        'model_version': version,
    }
    joblib.dump(bundle, artifacts_dir / 'model.joblib', compress=3)

    (artifacts_dir / 'feature_schema.json').write_text(json.dumps({'featureColumns': FEATURE_COLUMNS}, indent=2))
    (artifacts_dir / 'label_mapping.json').write_text(
        json.dumps(
            {
                'displayLabels': MODEL_LABELS,
                'modelClassOrder': list(getattr(best_model, 'classes_', MODEL_LABELS)),
            },
            indent=2,
        )
    )
    (artifacts_dir / 'model_version.txt').write_text(version)

    metrics_payload = {
        'selectedModel': best_model_name,
        'selectedModelVersion': version,
        'dataset': {
            'rows': int(len(dataset)),
            'trainRows': int(len(X_train)),
            'validationRows': int(len(X_val)),
            'testRows': int(len(X_test)),
            'featureCount': len(FEATURE_COLUMNS),
            'classDistribution': dataset['target'].value_counts().to_dict(),
        },
        'models': evaluation,
    }
    (artifacts_dir / 'metrics.json').write_text(json.dumps(metrics_payload, indent=2))
    (reports_dir / 'training_metrics.json').write_text(json.dumps(metrics_payload, indent=2))

    report_lines = [
        '# SAPNA ML Training Report',
        '',
        f"Selected model: **{best_model_name}**",
        f"Model version: `{version}`",
        '',
        '## Holdout Test Metrics',
    ]
    for model_name, details in evaluation.items():
        test_metrics = details['test']
        report_lines.extend(
            [
                '',
                f"### {model_name}",
                f"- Accuracy: {test_metrics['accuracy']}",
                f"- Macro Precision: {test_metrics['macro_precision']}",
                f"- Macro Recall: {test_metrics['macro_recall']}",
                f"- Macro F1: {test_metrics['macro_f1']}",
            ]
        )
    (reports_dir / 'training_report.md').write_text('\n'.join(report_lines) + '\n')

    return metrics_payload
