from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.synthetic_data import generate_and_save


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate proposal-aligned synthetic toddler monitoring data.')
    parser.add_argument('--rows', type=int, default=20000, help='Number of child-week samples to generate.')
    parser.add_argument('--seed', type=int, default=42, help='Random seed for reproducibility.')
    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path(__file__).resolve().parents[1] / '.generated',
        help='Directory where generated CSV files should be written.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    corpus = generate_and_save(args.output_dir, num_child_weeks=args.rows, seed=args.seed)
    print(f'Generated {len(corpus.weekly_dataset)} weekly samples and {len(corpus.raw_logs)} raw logs in {args.output_dir}')


if __name__ == '__main__':
    main()
