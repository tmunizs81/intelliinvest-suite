#!/usr/bin/env bash
# Deploy manual na VPS. Uso: bash scripts/deploy-vps.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/simplynvest}"
BRANCH="${BRANCH:-main}"

echo "📥 Pull origin/$BRANCH em $APP_DIR"
cd "$APP_DIR"
git fetch --all
git reset --hard "origin/$BRANCH"

echo "📦 Instalando dependências"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile
else
  npm ci
fi

echo "🔨 Build"
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npm run build
fi

echo "🔄 Reload nginx"
sudo systemctl reload nginx

echo "✅ Deploy concluído: $(git rev-parse --short HEAD)"
