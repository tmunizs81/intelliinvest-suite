#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════
#  T2-Simplynvest - Instalador de Produção
#  Ubuntu 24.04 LTS + Docker (Isolado)
# ══════════════════════════════════════════════

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
log_err()  { echo -e "${RED}✗ $1${NC}"; }
log_step() { echo -e "${YELLOW}[$1] $2${NC}"; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════╗"
echo "║   T2-Simplynvest - Instalador de Produção   ║"
echo "║     Ubuntu 24.04 + Docker (Isolado)          ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Verificar pré-requisitos ──
log_step "1/7" "Verificando pré-requisitos..."

# Docker
if ! command -v docker &> /dev/null; then
    log_err "Docker não encontrado! Instale com: sudo apt install docker.io docker-compose-v2"
    exit 1
fi
log_ok "Docker: $(docker --version | head -1)"

# Docker Compose (V2 plugin ou standalone)
COMPOSE_CMD=""
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    log_ok "Docker Compose V2: $(docker compose version --short 2>/dev/null || echo 'OK')"
elif command -v docker-compose &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
    log_ok "Docker Compose V1: $(docker-compose --version | head -1)"
else
    log_err "Docker Compose não encontrado!"
    echo "  Instale com: sudo apt install docker-compose-v2"
    exit 1
fi

# Verificar permissão Docker (sem sudo)
if ! docker info &> /dev/null 2>&1; then
    log_err "Sem permissão para usar Docker. Execute com sudo ou adicione seu usuário ao grupo docker:"
    echo "  sudo usermod -aG docker \$USER && newgrp docker"
    exit 1
fi

# Verificar curl (necessário para health check)
if ! command -v curl &> /dev/null; then
    log_warn "curl não encontrado. Instalando..."
    sudo apt-get update -qq && sudo apt-get install -y -qq curl > /dev/null 2>&1
    log_ok "curl instalado"
fi

# Verificar espaço em disco (mínimo 2GB)
AVAILABLE_GB=$(df "$PROJECT_DIR" --output=avail -BG 2>/dev/null | tail -1 | tr -d ' G' || echo "999")
if [ "$AVAILABLE_GB" -lt 2 ] 2>/dev/null; then
    log_err "Espaço em disco insuficiente: ${AVAILABLE_GB}GB disponível (mínimo 2GB)"
    exit 1
fi
log_ok "Espaço em disco: ${AVAILABLE_GB}GB disponível"

# ── 2. Verificar arquivos do projeto ──
log_step "2/7" "Verificando arquivos do projeto..."

REQUIRED_FILES=("$PROJECT_DIR/package.json" "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/nginx.conf" "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/.env.example")
for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        log_err "Arquivo não encontrado: $f"
        exit 1
    fi
done
log_ok "Todos os arquivos necessários encontrados"

# ── 3. Configurar .env ──
log_step "3/7" "Configurando variáveis de ambiente..."
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    log_ok "Arquivo .env criado a partir do .env.example"

    # Perguntar porta
    echo ""
    read -r -p "Porta para o T2-Simplynvest (padrão 3080): " CUSTOM_PORT
    CUSTOM_PORT=${CUSTOM_PORT:-3080}

    # Validar que é um número
    if ! [[ "$CUSTOM_PORT" =~ ^[0-9]+$ ]]; then
        log_err "Porta inválida: $CUSTOM_PORT"
        exit 1
    fi

    # Verificar se porta está em uso
    if command -v ss &> /dev/null; then
        PORT_CHECK="ss -tlnp"
    elif command -v netstat &> /dev/null; then
        PORT_CHECK="netstat -tlnp"
    else
        PORT_CHECK=""
    fi

    if [ -n "$PORT_CHECK" ] && $PORT_CHECK 2>/dev/null | grep -q ":${CUSTOM_PORT} "; then
        log_warn "Porta ${CUSTOM_PORT} já está em uso!"
        read -r -p "Escolha outra porta: " CUSTOM_PORT
        if ! [[ "$CUSTOM_PORT" =~ ^[0-9]+$ ]]; then
            log_err "Porta inválida: $CUSTOM_PORT"
            exit 1
        fi
    fi

    sed -i "s/APP_PORT=3080/APP_PORT=${CUSTOM_PORT}/" "$ENV_FILE"
    log_ok "Porta configurada: ${CUSTOM_PORT}"
else
    log_ok "Arquivo .env já existe"
fi

# Carregar variáveis
set -a
source "$ENV_FILE"
set +a
APP_PORT=${APP_PORT:-3080}

# ── 4. Parar container anterior (se existir) ──
log_step "4/7" "Verificando instalação anterior..."
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^investai-app$"; then
    log_warn "Container anterior encontrado. Parando..."
    cd "$SCRIPT_DIR" && $COMPOSE_CMD --env-file "$ENV_FILE" down 2>/dev/null || true
    log_ok "Container anterior removido"
else
    log_ok "Nenhuma instalação anterior encontrada"
fi

# ── 5. Build ──
log_step "5/7" "Construindo imagem Docker (pode levar 2-5 minutos)..."
cd "$SCRIPT_DIR" && $COMPOSE_CMD --env-file "$ENV_FILE" build --no-cache 2>&1 | tail -5
log_ok "Imagem construída com sucesso"

# ── 6. Iniciar ──
log_step "6/7" "Iniciando T2-Simplynvest..."
cd "$SCRIPT_DIR" && $COMPOSE_CMD --env-file "$ENV_FILE" up -d
sleep 2
log_ok "Container iniciado"

# ── 7. Health check ──
log_step "7/7" "Verificando se o sistema está respondendo..."

MAX_RETRIES=15
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${APP_PORT}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log_ok "InvestAI respondendo com HTTP 200!"
        break
    fi
    RETRY=$((RETRY + 1))
    echo -e "  Aguardando resposta... ($RETRY/$MAX_RETRIES) [HTTP: $HTTP_CODE]"
    sleep 3
done

if [ $RETRY -eq $MAX_RETRIES ]; then
    log_err "O sistema não respondeu após ${MAX_RETRIES} tentativas."
    echo ""
    echo -e "${YELLOW}  ── Diagnóstico ──${NC}"
    echo -e "  Container status:"
    docker ps -a --filter "name=investai-app" --format "  {{.Status}}" 2>/dev/null
    echo ""
    echo -e "  Últimos logs:"
    docker logs investai-app --tail 30 2>&1 | sed 's/^/  /'
    echo ""
    echo -e "${YELLOW}  Tente: docker logs investai-app${NC}"
    exit 1
fi

# Verificar container health
CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' investai-app 2>/dev/null || echo "unknown")
if [ "$CONTAINER_STATUS" != "running" ]; then
    log_warn "Container status: $CONTAINER_STATUS (esperado: running)"
fi

# ── Resultado Final ──
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP")

echo ""
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ InvestAI instalado com sucesso!${NC}"
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Acesse: ${GREEN}http://${SERVER_IP}:${APP_PORT}${NC}"
echo -e "  🌐 Local:  ${GREEN}http://localhost:${APP_PORT}${NC}"
echo ""
echo -e "  📋 Comandos úteis:"
echo -e "  ${YELLOW}docker logs investai-app -f${NC}           → Ver logs em tempo real"
echo -e "  ${YELLOW}docker restart investai-app${NC}           → Reiniciar"
echo -e "  ${YELLOW}docker stats investai-app${NC}             → Uso de CPU/RAM"
echo -e "  ${YELLOW}cd docker && $COMPOSE_CMD down${NC}        → Parar"
echo -e "  ${YELLOW}cd docker && $COMPOSE_CMD up -d${NC}       → Iniciar"
echo -e "  ${YELLOW}cd docker && bash install.sh${NC}          → Reinstalar"
echo -e "  ${YELLOW}cd docker && bash uninstall.sh${NC}        → Desinstalar"
echo ""
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
