#!/usr/bin/env bash
set -euo pipefail

PEM_PATH="/Users/minadadehiwala/DAPSPractice.pem"
EC2_HOST="ec2-user@ec2-18-139-192-254.ap-southeast-1.compute.amazonaws.com"
REMOTE_ROOT="/home/ec2-user/sapna-toddler-monitoring"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Syncing project to $EC2_HOST:$REMOTE_ROOT"
ssh -i "$PEM_PATH" "$EC2_HOST" "mkdir -p '$REMOTE_ROOT'"

rsync -az --delete \
  -e "ssh -i $PEM_PATH" \
  --exclude 'backend/node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude 'ml-service/.venv' \
  --exclude 'ml-service/.generated' \
  --exclude 'ml-service/.pytest_cache' \
  --exclude 'ml-service/__pycache__' \
  --exclude 'ml-service/**/*.pyc' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  "$LOCAL_ROOT/" "$EC2_HOST:$REMOTE_ROOT/"

echo "Running remote update script"
ssh -i "$PEM_PATH" "$EC2_HOST" "bash '$REMOTE_ROOT/deploy/remote-update.sh'"

echo "Deploy complete."
