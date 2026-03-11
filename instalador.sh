#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════
#  SimplyNvest - Instalador Completo para VPS
#  Faz clone do GitHub + build Docker automaticamente
# ══════════════════════════════════════════════════════════════

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="https://github.com/tmunizs81/intelliinvest-suite.git"
INSTALL_DIR="/opt/simplynvest"

log_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
log_err()  { echo -e "${RED}✗ $1${NC}"; }
log_step() { echo -e "\n${BLUE}[$1] $2${NC}"; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   SimplyNvest - Instalador Completo para VPS            ║"
echo "║   Clone GitHub + Docker Build Automático                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar root
if [ "$EUID" -ne 0 ]; then
    log_err "Execute como root: sudo bash instalador.sh"
    exit 1
fi

# ── 1. Dependências do sistema ──
log_step "1/6" "Instalando dependências do sistema..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release > /dev/null 2>&1
log_ok "Dependências instaladas"

# ── 2. Docker ──
log_step "2/6" "Verificando Docker..."
if ! command -v docker &> /dev/null; then
    log_warn "Docker não encontrado. Instalando..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null 2>&1
    systemctl enable docker
    systemctl start docker
    log_ok "Docker instalado"
else
    log_ok "Docker já instalado: $(docker --version | head -1)"
fi

# Verificar Docker Compose
if ! docker compose version &> /dev/null 2>&1; then
    log_err "Docker Compose não encontrado!"
    exit 1
fi
log_ok "Docker Compose: $(docker compose version --short 2>/dev/null)"

# ── 3. Clonar repositório ──
log_step "3/6" "Baixando código do GitHub..."
if [ -d "$INSTALL_DIR" ]; then
    if [ -d "$INSTALL_DIR/.git" ]; then
        log_warn "Diretório já existe. Atualizando via git pull..."
        cd "$INSTALL_DIR"
        git fetch --all
        git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
        git pull
        log_ok "Código atualizado"
    else
        log_warn "Diretório existe mas não é repositório Git. Removendo e clonando novamente..."
        rm -rf "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        log_ok "Código clonado em $INSTALL_DIR"
    fi
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    log_ok "Código clonado em $INSTALL_DIR"
fi

# ── 4. Configurar .env ──
log_step "4/6" "Configurando variáveis de ambiente..."
ENV_FILE="$INSTALL_DIR/docker/.env"

if [ ! -f "$ENV_FILE" ]; then
    cp "$INSTALL_DIR/docker/.env.example" "$ENV_FILE"

    echo ""
    read -r -p "  Porta para o SimplyNvest (padrão 3080): " CUSTOM_PORT
    CUSTOM_PORT=${CUSTOM_PORT:-3080}

    if ! [[ "$CUSTOM_PORT" =~ ^[0-9]+$ ]] || [ "$CUSTOM_PORT" -lt 1024 ] || [ "$CUSTOM_PORT" -gt 65535 ]; then
        log_err "Porta inválida: $CUSTOM_PORT (use entre 1024-65535)"
        exit 1
    fi

    sed -i "s/APP_PORT=3080/APP_PORT=${CUSTOM_PORT}/" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log_ok "Porta configurada: ${CUSTOM_PORT}"
else
    log_ok "Arquivo .env já existe"
fi

# Carregar variáveis
set -a; source "$ENV_FILE"; set +a
APP_PORT=${APP_PORT:-3080}

# ── 5. Build e Deploy ──
log_step "5/6" "Construindo e iniciando (pode levar 2-5 min)..."

cd "$INSTALL_DIR/docker"

# Parar container anterior se existir
docker compose --env-file "$ENV_FILE" down 2>/dev/null || true

# Build e start
docker compose --env-file "$ENV_FILE" build --no-cache 2>&1 | tail -5
docker compose --env-file "$ENV_FILE" up -d
sleep 3
log_ok "Container iniciado"

# ── 6. Health check ──
log_step "6/6" "Verificando se está respondendo..."
MAX_RETRIES=20
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${APP_PORT}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        break
    fi
    RETRY=$((RETRY + 1))
    echo -e "  Aguardando... ($RETRY/$MAX_RETRIES)"
    sleep 3
done

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP")

if [ $RETRY -lt $MAX_RETRIES ]; then
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ SimplyNvest instalado com sucesso!${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  🌐 Acesso: ${GREEN}http://${SERVER_IP}:${APP_PORT}${NC}"
    echo -e "  🌐 Local:  ${GREEN}http://localhost:${APP_PORT}${NC}"
    echo ""
    echo -e "  📋 Comandos úteis:"
    echo -e "  ${YELLOW}docker logs simplynvest-app -f${NC}       → Logs"
    echo -e "  ${YELLOW}docker restart simplynvest-app${NC}       → Reiniciar"
    echo -e "  ${YELLOW}cd $INSTALL_DIR && sudo bash instalador.sh${NC} → Atualizar"
    echo ""
else
    log_err "Falha no health check. Verifique: docker logs simplynvest-app"
    exit 1
fi
