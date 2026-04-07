from __future__ import annotations

from pathlib import Path

import pandas as pd

from .feature_config import (
    DOMAINS,
    DOMAIN_EXPECTATION_BASE,
    DOMAIN_EXPECTATION_GROWTH,
    FEATURE_COLUMNS,
    SUCCESS_LEVELS,
    SUCCESS_SCORE,
)


def clip(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, float(value)))


def round_metric(value: float) -> float:
    return round(float(value), 4)


def age_band_progress(age_in_months: float) -> float:
    return clip((float(age_in_months) - 12.0) / 24.0, 0.0, 1.0)


def expected_completion_score(age_in_months: float, domain: str) -> float:
    progress = age_band_progress(age_in_months)
    base = DOMAIN_EXPECTATION_BASE[domain]
    growth = DOMAIN_EXPECTATION_GROWTH[domain]
    return clip(base + progress * growth, 0.35, 0.95)


def build_weekly_feature_row(logs_df: pd.DataFrame, age_in_months: int) -> dict[str, float]:
    if logs_df.empty:
        row = {feature: 0.0 for feature in FEATURE_COLUMNS}
        row['age_in_months'] = float(age_in_months)
        row['age_band_progress'] = age_band_progress(age_in_months)
        return row

    working = logs_df.copy()
    working['completedAt'] = pd.to_datetime(working['completedAt'])
    working['success_score'] = working['successLevel'].map(SUCCESS_SCORE).fillna(0.0)

    total_logs = float(len(working))
    total_duration = float(working['durationMinutes'].sum())
    active_days = float(working['completedAt'].dt.date.nunique())
    avg_duration = total_duration / total_logs if total_logs else 0.0
    avg_parent_confidence = (
        float(working['parentConfidence'].mean()) if total_logs else 0.0
    )

    row = {
        'age_in_months': float(age_in_months),
        'age_band_progress': age_band_progress(age_in_months),
        'weekly_log_count': total_logs,
        'active_days': active_days,
        'engagement_consistency': round_metric(active_days / 7.0),
        'total_duration_minutes': round_metric(total_duration),
        'avg_duration_minutes': round_metric(avg_duration),
        'avg_parent_confidence': round_metric(avg_parent_confidence),
        'overall_completion_score': round_metric(float(working['success_score'].mean())),
    }

    for success_level in SUCCESS_LEVELS:
        ratio = float((working['successLevel'] == success_level).mean()) if total_logs else 0.0
        row[f'{success_level}_ratio'] = round_metric(ratio)

    observed_domain_scores = []
    expected_domain_scores = []

    for domain in DOMAINS:
        domain_logs = working.loc[working['domain'] == domain]
        domain_log_count = float(len(domain_logs))
        share = domain_log_count / total_logs if total_logs else 0.0
        completion_score = (
            float(domain_logs['success_score'].mean()) if domain_log_count else 0.0
        )
        mastered_ratio = (
            float((domain_logs['successLevel'] == 'mastered').mean()) if domain_log_count else 0.0
        )
        expected_score = expected_completion_score(age_in_months, domain)
        age_gap = completion_score - expected_score

        row[f'{domain}_log_share'] = round_metric(share)
        row[f'{domain}_completion_score'] = round_metric(completion_score)
        row[f'{domain}_mastered_ratio'] = round_metric(mastered_ratio)
        row[f'{domain}_age_gap'] = round_metric(age_gap)

        observed_domain_scores.append(completion_score)
        expected_domain_scores.append(expected_score)

    row['overall_age_gap'] = round_metric(
        (sum(observed_domain_scores) / len(observed_domain_scores))
        - (sum(expected_domain_scores) / len(expected_domain_scores))
    )

    return {feature: round_metric(row.get(feature, 0.0)) for feature in FEATURE_COLUMNS}


def clean_raw_logs(raw_logs: pd.DataFrame) -> pd.DataFrame:
    required_columns = {
        'child_id',
        'week_start',
        'completedAt',
        'domain',
        'durationMinutes',
        'successLevel',
        'parentConfidence',
    }
    cleaned = raw_logs.copy()
    missing = required_columns.difference(cleaned.columns)
    if missing:
        raise ValueError(f'Missing required raw log columns: {sorted(missing)}')

    cleaned = cleaned.drop_duplicates(
        subset=['child_id', 'completedAt', 'domain', 'durationMinutes', 'successLevel', 'parentConfidence']
    )
    cleaned['completedAt'] = pd.to_datetime(cleaned['completedAt'], errors='coerce')
    cleaned['durationMinutes'] = pd.to_numeric(cleaned['durationMinutes'], errors='coerce')
    cleaned['parentConfidence'] = pd.to_numeric(cleaned['parentConfidence'], errors='coerce')
    cleaned = cleaned.loc[cleaned['completedAt'].notna()]
    cleaned = cleaned.loc[cleaned['durationMinutes'].notna() & (cleaned['durationMinutes'] > 0)]
    cleaned = cleaned.loc[
        cleaned['parentConfidence'].notna()
        & (cleaned['parentConfidence'] >= 1)
        & (cleaned['parentConfidence'] <= 5)
    ]
    cleaned = cleaned.loc[cleaned['domain'].isin(DOMAINS)]
    cleaned = cleaned.loc[cleaned['successLevel'].isin(SUCCESS_LEVELS)]
    cleaned['week_start'] = pd.to_datetime(cleaned['week_start']).dt.date.astype(str)
    cleaned['durationMinutes'] = cleaned['durationMinutes'].astype(int)
    cleaned['parentConfidence'] = cleaned['parentConfidence'].astype(float)
    return cleaned.reset_index(drop=True)


def build_training_dataset(raw_logs: pd.DataFrame, targets: pd.DataFrame) -> pd.DataFrame:
    cleaned = clean_raw_logs(raw_logs)
    working_targets = targets.copy()
    working_targets['week_start'] = pd.to_datetime(working_targets['week_start']).dt.date.astype(str)

    rows: list[dict[str, float | str]] = []
    group_columns = ['child_id', 'week_start']
    for (child_id, week_start), group in cleaned.groupby(group_columns, sort=False):
        target_row = working_targets.loc[
            (working_targets['child_id'] == child_id) & (working_targets['week_start'] == week_start)
        ]
        if target_row.empty:
            continue

        age_in_months = int(target_row.iloc[0]['age_in_months'])
        feature_row = build_weekly_feature_row(group, age_in_months)
        feature_row.update(
            {
                'child_id': child_id,
                'week_start': week_start,
                'target': str(target_row.iloc[0]['target']),
            }
        )
        rows.append(feature_row)

    dataset = pd.DataFrame(rows)
    ordered_columns = ['child_id', 'week_start', 'target', *FEATURE_COLUMNS]
    return dataset[ordered_columns].sort_values(['child_id', 'week_start']).reset_index(drop=True)


def save_csv(dataframe: pd.DataFrame, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(output_path, index=False)
