#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if command -v python3.9 >/dev/null 2>&1; then
  PYTHON_BIN="python3.9"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$ROOT:/workspace/ml-service" -w /workspace/ml-service python:3.9-slim bash -lc '
    python -m pip install --upgrade pip &&
    python -m pip install -r requirements-dev.txt &&
    python scripts/generate_mock_data.py --rows 20000 --seed 42 &&
    python scripts/train_models.py --rows 20000 --seed 42 &&
    pytest tests
  '
  exit 0
else
  echo "Python 3.9 or Docker is required to run the local ML pipeline." >&2
  exit 1
fi

VENV_DIR="$ROOT/.venv"
$PYTHON_BIN -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$ROOT/requirements-dev.txt"
python "$ROOT/scripts/generate_mock_data.py" --rows 20000 --seed 42
python "$ROOT/scripts/train_models.py" --rows 20000 --seed 42
pytest "$ROOT/tests"
