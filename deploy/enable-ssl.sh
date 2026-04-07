#!/usr/bin/env bash
set -euo pipefail

DOMAIN="sapna.minadadehiwala.com"
EMAIL="admin@minadadehiwala.com"

sudo certbot --nginx -d "$DOMAIN" --agree-tos -m "$EMAIL" --redirect --non-interactive
sudo nginx -t
sudo systemctl reload nginx

echo "SSL enabled for $DOMAIN"
