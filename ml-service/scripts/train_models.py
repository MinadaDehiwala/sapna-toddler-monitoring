from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd

from app.synthetic_data import generate_and_save
from app.training import train_and_select_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Train SAPNA ML models from generated synthetic data.')
    parser.add_argument('--rows', type=int, default=20000, help='Number of child-week samples to generate if dataset is missing.')
    parser.add_argument('--seed', type=int, default=42, help='Random seed used for generation and splitting.')
    parser.add_argument(
        '--data-dir',
        type=Path,
        default=Path(__file__).resolve().parents[1] / '.generated',
        help='Directory containing generated CSV files.',
    )
    parser.add_argument(
        '--artifacts-dir',
        type=Path,
        default=Path(__file__).resolve().parents[1] / 'artifacts' / 'production',
        help='Directory where the production model bundle should be written.',
    )
    parser.add_argument(
        '--reports-dir',
        type=Path,
        default=Path(__file__).resolve().parents[1] / 'reports',
        help='Directory where evaluation reports should be written.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_path = args.data_dir / 'weekly_training_dataset.csv'
    if not dataset_path.exists():
        generate_and_save(args.data_dir, num_child_weeks=args.rows, seed=args.seed)
    dataset = pd.read_csv(dataset_path)
    metrics = train_and_select_model(dataset, args.artifacts_dir, args.reports_dir, random_state=args.seed)
    selected = metrics['selectedModel']
    macro_f1 = metrics['models'][selected]['test']['macro_f1']
    print(f'Selected {selected} with holdout macro-F1={macro_f1}')


if __name__ == '__main__':
    main()
