#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/ec2-user/sapna-toddler-monitoring"
WWW_ROOT="/var/www/sapna.minadadehiwala.com"
NGINX_CONF_NAME="sapna.minadadehiwala.com.conf"
BACKEND_ENV_FILE="$APP_ROOT/backend/.env"

if [[ ! -d "$APP_ROOT" ]]; then
  echo "Missing app root: $APP_ROOT"
  exit 1
fi

ensure_env_var() {
  local file_path="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$file_path" ]]; then
    return
  fi

  if ! grep -q "^${key}=" "$file_path"; then
    echo "${key}=${value}" >> "$file_path"
  fi
}

ensure_env_var "$BACKEND_ENV_FILE" "ML_SERVICE_ENABLED" "true"
ensure_env_var "$BACKEND_ENV_FILE" "ML_SERVICE_URL" "http://127.0.0.1:8010"
ensure_env_var "$BACKEND_ENV_FILE" "ML_SERVICE_TIMEOUT_MS" "1000"
ensure_env_var "$BACKEND_ENV_FILE" "ML_HEALTH_TIMEOUT_MS" "600"
ensure_env_var "$BACKEND_ENV_FILE" "ML_CONFIDENCE_THRESHOLD" "0.55"
ensure_env_var "$BACKEND_ENV_FILE" "RULE_ENGINE_VERSION" "sapna-rules-v1"

cd "$APP_ROOT/ml-service"
python3 -m venv venv
./venv/bin/python -m pip install --upgrade pip
./venv/bin/python -m pip install -r requirements.txt

cd "$APP_ROOT/backend"
npm ci --omit=dev
pm2 startOrReload ecosystem.config.cjs --only sapna-toddler-api
pm2 startOrReload ecosystem.config.cjs --only sapna-ml-api
pm2 save

cd "$APP_ROOT/frontend"
npm ci
npm run build

sudo mkdir -p "$WWW_ROOT"
sudo rsync -a --delete dist/ "$WWW_ROOT/"

sudo cp "$APP_ROOT/deploy/nginx-sapna.minadadehiwala.com.conf" "/etc/nginx/conf.d/$NGINX_CONF_NAME"
sudo nginx -t
sudo systemctl reload nginx

echo "Remote update complete."
