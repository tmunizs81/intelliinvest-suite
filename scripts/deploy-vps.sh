#!/usr/bin/env bash
# Deploy manual na VPS (Docker Compose). Uso: bash scripts/deploy-vps.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simplynvest}"
BRANCH="${BRANCH:-main}"

echo "📥 Pull origin/$BRANCH em $APP_DIR"
cd "$APP_DIR"
git fetch --all
git reset --hard "origin/$BRANCH"

echo "🐳 Rebuild containers"
cd "$APP_DIR/docker"
docker compose down
docker compose build
docker compose up -d

echo "🧹 Limpando imagens antigas"
docker image prune -f

echo "✅ Deploy concluído: $(cd $APP_DIR && git rev-parse --short HEAD)"
docker compose ps
