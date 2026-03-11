#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/simplynvest"
ENV_FILE="$INSTALL_DIR/docker/.env"

echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  SimplyNvest - Atualização Rápida${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Execute como root: sudo bash docker/update.sh${NC}"
    exit 1
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
    echo -e "${RED}✗ Projeto não encontrado em $INSTALL_DIR. Execute o instalador primeiro.${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

# 1. Baixar atualizações
echo -e "\n${BLUE}[1/3]${NC} Baixando atualizações..."
git fetch --all
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}✓ Já está na versão mais recente!${NC}"
    echo -e "  Commit: ${YELLOW}${LOCAL:0:8}${NC}"
    exit 0
fi

git reset --hard "$REMOTE"
echo -e "${GREEN}✓ Código atualizado${NC}"
echo -e "  De: ${YELLOW}${LOCAL:0:8}${NC} → Para: ${GREEN}${REMOTE:0:8}${NC}"

# 2. Rebuild
echo -e "\n${BLUE}[2/3]${NC} Reconstruindo container..."
cd "$INSTALL_DIR/docker"
docker compose --env-file "$ENV_FILE" build 2>&1 | tail -3
echo -e "${GREEN}✓ Build concluído${NC}"

# 3. Restart
echo -e "\n${BLUE}[3/3]${NC} Reiniciando..."
docker compose --env-file "$ENV_FILE" up -d
sleep 3

# Health check
set -a; source "$ENV_FILE"; set +a
APP_PORT=${APP_PORT:-3080}
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${APP_PORT}" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "\n${GREEN}══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ Atualização concluída com sucesso!${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
    echo -e "  Versão: ${GREEN}${REMOTE:0:8}${NC}"
    echo -e "  Acesso: ${GREEN}http://$(hostname -I 2>/dev/null | awk '{print $1}'):${APP_PORT}${NC}"
else
    echo -e "${YELLOW}⚠ Container iniciado mas health check retornou $HTTP_CODE${NC}"
    echo -e "  Verifique: ${YELLOW}docker logs simplynvest-app${NC}"
fi
