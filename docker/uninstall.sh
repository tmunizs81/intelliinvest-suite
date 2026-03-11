#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

echo -e "${YELLOW}Parando e removendo InvestAI...${NC}"
cd "$SCRIPT_DIR" && $COMPOSE_CMD down --rmi all --volumes 2>/dev/null || true
docker network rm investai-net 2>/dev/null || true

echo -e "${GREEN}✅ InvestAI removido com sucesso. Nenhum outro serviço foi afetado.${NC}"
