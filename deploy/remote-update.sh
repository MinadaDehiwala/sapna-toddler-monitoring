#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/ec2-user/sapna-toddler-monitoring"
WWW_ROOT="/var/www/sapna.minadadehiwala.com"
NGINX_CONF_NAME="sapna.minadadehiwala.com.conf"

if [[ ! -d "$APP_ROOT" ]]; then
  echo "Missing app root: $APP_ROOT"
  exit 1
fi

cd "$APP_ROOT/backend"
npm ci --omit=dev
pm2 startOrReload ecosystem.config.cjs --only sapna-toddler-api
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
