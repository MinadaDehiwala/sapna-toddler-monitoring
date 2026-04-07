from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from .feature_config import DOMAINS
from .feature_engineering import age_band_progress, build_training_dataset, expected_completion_score, save_csv

ACTIVITY_LIBRARY = {
    'cognitive': ['shape_sorting', 'memory_match', 'object_hunt'],
    'motor': ['stack_blocks', 'ball_roll', 'balance_steps'],
    'language': ['name_objects', 'sound_imitation', 'story_turns'],
    'social_emotional': ['turn_taking', 'emotion_cards', 'mirror_play'],
}

STATUS_CONFIG = {
    'on_track': {
        'skill_shift': 0.14,
        'engagement': 0.8,
        'confidence_shift': 0.3,
        'log_lambda': 8.2,
        'weak_domains': (0, 1),
    },
    'needs_monitoring': {
        'skill_shift': -0.02,
        'engagement': 0.58,
        'confidence_shift': -0.05,
        'log_lambda': 6.3,
        'weak_domains': (1, 2),
    },
    'at_risk': {
        'skill_shift': -0.18,
        'engagement': 0.38,
        'confidence_shift': -0.35,
        'log_lambda': 4.4,
        'weak_domains': (2, 3),
    },
}

SUCCESS_THRESHOLDS = [0.34, 0.58, 0.79]
STATUS_DISTRIBUTION = [0.5, 0.3, 0.2]


@dataclass(frozen=True)
class SyntheticCorpus:
    raw_logs: pd.DataFrame
    weekly_targets: pd.DataFrame
    weekly_dataset: pd.DataFrame


def clip(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, float(value)))


def choose_success_level(observed_skill: float, rng: np.random.Generator) -> str:
    noisy_skill = clip(observed_skill + rng.normal(0, 0.06), 0.0, 1.0)
    if noisy_skill < SUCCESS_THRESHOLDS[0]:
        weights = [0.66, 0.26, 0.07, 0.01]
    elif noisy_skill < SUCCESS_THRESHOLDS[1]:
        weights = [0.2, 0.47, 0.27, 0.06]
    elif noisy_skill < SUCCESS_THRESHOLDS[2]:
        weights = [0.05, 0.2, 0.48, 0.27]
    else:
        weights = [0.02, 0.08, 0.36, 0.54]
    return rng.choice(['needs_help', 'partial', 'completed', 'mastered'], p=weights)


def sample_note(status: str, domain: str, rng: np.random.Generator) -> str:
    notes = {
        'on_track': [
            'Engaged quickly and completed the task with little support.',
            'Positive mood throughout the activity.',
            'Responded well to the guided play routine.',
        ],
        'needs_monitoring': [
            'Needed reminders to stay focused.',
            'Completed some steps but lost attention halfway.',
            'Showed mixed responses across repeated attempts.',
        ],
        'at_risk': [
            'Required repeated prompting to continue.',
            'Avoided the activity and needed substantial support.',
            'Low tolerance for the task during this session.',
        ],
    }
    suffix = {
        'cognitive': 'Focus and matching were the main goals.',
        'motor': 'Gross and fine motor coordination were observed.',
        'language': 'Parent tracked naming and sound imitation attempts.',
        'social_emotional': 'Parent observed turn-taking and emotional response cues.',
    }
    return f"{rng.choice(notes[status])} {suffix[domain]}"


def determine_weekly_label(latent_status: str, overall_gap: float, low_data: bool, rng: np.random.Generator) -> str:
    if latent_status == 'on_track' and (overall_gap < -0.16 or low_data):
        return 'needs_monitoring'
    if latent_status == 'needs_monitoring' and overall_gap < -0.24:
        return 'at_risk'
    if latent_status == 'needs_monitoring' and overall_gap > -0.02 and rng.random() < 0.18:
        return 'on_track'
    if latent_status == 'at_risk' and overall_gap > -0.1 and rng.random() < 0.12:
        return 'needs_monitoring'
    if rng.random() < 0.025:
        return rng.choice(['on_track', 'needs_monitoring', 'at_risk'])
    return latent_status


def generate_synthetic_corpus(num_child_weeks: int = 20_000, seed: int = 42) -> SyntheticCorpus:
    rng = np.random.default_rng(seed)
    raw_rows: list[dict[str, object]] = []
    target_rows: list[dict[str, object]] = []

    base_week = datetime(2025, 1, 6)
    sample_count = 0
    child_index = 0

    while sample_count < num_child_weeks:
        child_id = f'child_{child_index:05d}'
        child_index += 1
        weeks_for_child = int(rng.integers(4, 9))
        child_profile = rng.choice(['on_track', 'needs_monitoring', 'at_risk'], p=STATUS_DISTRIBUTION)
        start_age = int(rng.integers(12, 34))
        child_start_week = base_week + timedelta(days=int(rng.integers(0, 280)))
        child_stability = rng.normal(0, 0.05)

        for week_offset in range(weeks_for_child):
            if sample_count >= num_child_weeks:
                break

            week_start = child_start_week + timedelta(days=7 * week_offset)
            age_in_months = min(36, start_age + week_offset // 4)
            config = STATUS_CONFIG[child_profile]
            progress = age_band_progress(age_in_months)
            engagement = clip(config['engagement'] + progress * 0.08 + rng.normal(0, 0.08), 0.12, 0.98)

            weak_domain_count = int(rng.integers(config['weak_domains'][0], config['weak_domains'][1] + 1))
            weak_domains = set(rng.choice(DOMAINS, size=weak_domain_count, replace=False).tolist()) if weak_domain_count else set()
            domain_skill = {}
            observed_domain_scores = []
            expected_scores = []
            for domain in DOMAINS:
                expected_score = expected_completion_score(age_in_months, domain)
                penalty = rng.uniform(0.09, 0.2) if domain in weak_domains else 0.0
                skill = clip(
                    expected_score
                    + config['skill_shift']
                    + child_stability
                    + rng.normal(0, 0.07)
                    - penalty,
                    0.05,
                    0.98,
                )
                domain_skill[domain] = skill
                observed_domain_scores.append(skill)
                expected_scores.append(expected_score)

            overall_gap = (sum(observed_domain_scores) / len(observed_domain_scores)) - (
                sum(expected_scores) / len(expected_scores)
            )
            log_count = max(1, int(rng.poisson(config['log_lambda'] + progress * 1.4)))
            active_day_count = max(1, min(7, int(round(log_count * clip(engagement, 0.25, 1.0)))))
            active_days = sorted(rng.choice(np.arange(7), size=active_day_count, replace=False).tolist())

            weekly_label = determine_weekly_label(child_profile, overall_gap, log_count < 3, rng)
            target_rows.append(
                {
                    'child_id': child_id,
                    'week_start': week_start.date().isoformat(),
                    'age_in_months': age_in_months,
                    'target': weekly_label,
                    'latent_profile': child_profile,
                    'overall_gap': round(overall_gap, 4),
                }
            )

            for log_index in range(log_count):
                domain_weights = np.array([
                    1.15 if domain not in weak_domains else 0.9 for domain in DOMAINS
                ])
                domain_weights = domain_weights / domain_weights.sum()
                domain = rng.choice(DOMAINS, p=domain_weights)
                activity_code = rng.choice(ACTIVITY_LIBRARY[domain])
                scheduled_day = int(active_days[log_index % len(active_days)])
                completed_at = week_start + timedelta(
                    days=scheduled_day,
                    hours=int(rng.integers(8, 20)),
                    minutes=int(rng.integers(0, 60)),
                )
                duration_minutes = int(
                    clip(rng.normal(11 + engagement * 7, 3.6), 3, 30)
                )
                observed_skill = clip(domain_skill[domain] + rng.normal(0, 0.08), 0.02, 0.99)
                success_level = choose_success_level(observed_skill, rng)
                confidence = clip(
                    1.0 + ((observed_skill * 0.58) + (engagement * 0.42) + config['confidence_shift']) * 4.0 + rng.normal(0, 0.35),
                    1.0,
                    5.0,
                )

                raw_rows.append(
                    {
                        'log_id': f'{child_id}_{week_start.date().isoformat()}_{log_index:02d}',
                        'child_id': child_id,
                        'week_start': week_start.date().isoformat(),
                        'completedAt': completed_at.isoformat(),
                        'domain': domain,
                        'activity_code': activity_code,
                        'durationMinutes': duration_minutes,
                        'successLevel': success_level,
                        'parentConfidence': round(confidence, 2),
                        'notes': sample_note(weekly_label, domain, rng),
                    }
                )

            sample_count += 1

    raw_logs = pd.DataFrame(raw_rows)
    weekly_targets = pd.DataFrame(target_rows)

    duplicate_count = max(1, int(len(raw_logs) * 0.018))
    duplicate_rows = raw_logs.sample(n=duplicate_count, random_state=seed).copy()
    raw_logs = pd.concat([raw_logs, duplicate_rows], ignore_index=True)

    zero_duration_count = max(1, int(len(raw_logs) * 0.012))
    malformed_count = max(1, int(len(raw_logs) * 0.008))
    zero_idx = raw_logs.sample(n=zero_duration_count, random_state=seed + 1).index
    malformed_idx = raw_logs.drop(index=zero_idx).sample(n=malformed_count, random_state=seed + 2).index
    raw_logs.loc[zero_idx, 'durationMinutes'] = 0
    raw_logs.loc[malformed_idx[: len(malformed_idx) // 2], 'successLevel'] = 'invalid_state'
    raw_logs.loc[malformed_idx[len(malformed_idx) // 2 :], 'parentConfidence'] = None

    weekly_dataset = build_training_dataset(raw_logs, weekly_targets)
    return SyntheticCorpus(raw_logs=raw_logs, weekly_targets=weekly_targets, weekly_dataset=weekly_dataset)


def generate_and_save(output_dir: Path, num_child_weeks: int = 20_000, seed: int = 42) -> SyntheticCorpus:
    corpus = generate_synthetic_corpus(num_child_weeks=num_child_weeks, seed=seed)
    output_dir.mkdir(parents=True, exist_ok=True)
    save_csv(corpus.raw_logs, output_dir / 'raw_parent_logs.csv')
    save_csv(corpus.weekly_targets, output_dir / 'weekly_targets.csv')
    save_csv(corpus.weekly_dataset, output_dir / 'weekly_training_dataset.csv')
    return corpus
