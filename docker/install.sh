#!/bin/bash
set -e

# ══════════════════════════════════════════════
#  InvestAI - Instalador de Produção
#  Ubuntu 24.04 + Docker (isolado)
# ══════════════════════════════════════════════

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║     InvestAI - Instalador de Produção    ║"
echo "║     Ubuntu 24.04 + Docker (Isolado)      ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Verificar Docker ──
echo -e "${YELLOW}[1/6] Verificando Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker não encontrado! Instale o Docker primeiro.${NC}"
    exit 1
fi
if ! docker compose version &> /dev/null && ! docker-compose --version &> /dev/null; then
    echo -e "${RED}✗ Docker Compose não encontrado!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker encontrado: $(docker --version)${NC}"

# Detectar comando compose
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

# ── 2. Configurar .env ──
echo -e "${YELLOW}[2/6] Configurando variáveis de ambiente...${NC}"
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    echo -e "${GREEN}✓ Arquivo .env criado a partir do .env.example${NC}"
    
    # Perguntar porta
    read -p "Porta para o InvestAI (padrão 3080): " CUSTOM_PORT
    CUSTOM_PORT=${CUSTOM_PORT:-3080}
    
    # Verificar se porta está em uso
    if ss -tlnp | grep -q ":${CUSTOM_PORT} "; then
        echo -e "${RED}⚠ Porta ${CUSTOM_PORT} já está em uso!${NC}"
        read -p "Escolha outra porta: " CUSTOM_PORT
    fi
    
    sed -i "s/APP_PORT=3080/APP_PORT=${CUSTOM_PORT}/" "$ENV_FILE"
    echo -e "${GREEN}✓ Porta configurada: ${CUSTOM_PORT}${NC}"
else
    echo -e "${GREEN}✓ Arquivo .env já existe${NC}"
fi

# Carregar porta do .env
source "$ENV_FILE"
APP_PORT=${APP_PORT:-3080}

# ── 3. Parar container anterior (se existir) ──
echo -e "${YELLOW}[3/6] Verificando instalação anterior...${NC}"
if docker ps -a --format '{{.Names}}' | grep -q "investai-app"; then
    echo -e "${YELLOW}  → Parando container anterior...${NC}"
    cd "$SCRIPT_DIR" && $COMPOSE_CMD down 2>/dev/null || true
fi
echo -e "${GREEN}✓ Pronto para instalar${NC}"

# ── 4. Build ──
echo -e "${YELLOW}[4/6] Construindo imagem Docker (pode levar alguns minutos)...${NC}"
cd "$SCRIPT_DIR" && $COMPOSE_CMD build --no-cache
echo -e "${GREEN}✓ Imagem construída com sucesso${NC}"

# ── 5. Iniciar ──
echo -e "${YELLOW}[5/6] Iniciando InvestAI...${NC}"
cd "$SCRIPT_DIR" && $COMPOSE_CMD up -d
echo -e "${GREEN}✓ Container iniciado${NC}"

# ── 6. Health check ──
echo -e "${YELLOW}[6/6] Verificando se o sistema está rodando...${NC}"
sleep 3

MAX_RETRIES=10
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -sf "http://localhost:${APP_PORT}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ InvestAI está rodando!${NC}"
        break
    fi
    RETRY=$((RETRY + 1))
    echo -e "  Aguardando... ($RETRY/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ O sistema não respondeu após ${MAX_RETRIES} tentativas.${NC}"
    echo -e "${YELLOW}  Verificando logs:${NC}"
    docker logs investai-app --tail 20
    exit 1
fi

# ── Resultado ──
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ InvestAI instalado com sucesso!${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Acesse: ${GREEN}http://${SERVER_IP}:${APP_PORT}${NC}"
echo -e "  🌐 Local:  ${GREEN}http://localhost:${APP_PORT}${NC}"
echo ""
echo -e "  📋 Comandos úteis:"
echo -e "  ${YELLOW}docker logs investai-app${NC}        → Ver logs"
echo -e "  ${YELLOW}docker restart investai-app${NC}     → Reiniciar"
echo -e "  ${YELLOW}cd docker && $COMPOSE_CMD down${NC}  → Parar"
echo -e "  ${YELLOW}cd docker && $COMPOSE_CMD up -d${NC} → Iniciar"
echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
