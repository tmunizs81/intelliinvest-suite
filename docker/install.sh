#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════
#  T2-Simplynvest - Instalador de Produção
#  Ubuntu 24.04 LTS + Docker (Coexistência com outros sistemas)
# ══════════════════════════════════════════════════════════════
# IMPORTANTE: Este instalador NÃO interfere com containers ou
# serviços já rodando na porta 80. O SimplyNvest roda isolado
# na porta 3080 (configurável) com rede Docker própria.
# ══════════════════════════════════════════════════════════════

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
log_step() { echo -e "\n${YELLOW}[$1] $2${NC}"; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║    T2-Simplynvest - Instalador de Produção          ║"
echo "║    Ubuntu 24.04 + Docker (Coexistência Segura)      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Verificar SO ──
log_step "1/9" "Verificando sistema operacional..."

if [ -f /etc/os-release ]; then
    . /etc/os-release
    log_ok "SO: $PRETTY_NAME"
else
    log_warn "Não foi possível detectar o SO"
fi

# Verificar arquitetura
ARCH=$(uname -m)
log_ok "Arquitetura: $ARCH"

# ── 2. Instalar dependências do sistema ──
log_step "2/9" "Verificando dependências do sistema..."

PACKAGES_TO_INSTALL=""

for pkg in curl git ca-certificates gnupg lsb-release; do
    if ! dpkg -s "$pkg" &> /dev/null 2>&1; then
        PACKAGES_TO_INSTALL="$PACKAGES_TO_INSTALL $pkg"
    fi
done

if [ -n "$PACKAGES_TO_INSTALL" ]; then
    log_warn "Instalando pacotes:$PACKAGES_TO_INSTALL"
    sudo apt-get update -qq
    sudo apt-get install -y -qq $PACKAGES_TO_INSTALL > /dev/null 2>&1
    log_ok "Pacotes instalados"
else
    log_ok "Todas as dependências do sistema já instaladas"
fi

# ── 3. Verificar Docker ──
log_step "3/9" "Verificando Docker..."

if ! command -v docker &> /dev/null; then
    log_warn "Docker não encontrado. Instalando..."
    # Instalar Docker via repositório oficial
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null 2>&1
    sudo systemctl enable docker
    sudo systemctl start docker
    # Adicionar usuário ao grupo docker
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    log_ok "Docker instalado com sucesso"
fi

log_ok "Docker: $(docker --version | head -1)"

# Docker Compose
COMPOSE_CMD=""
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    log_ok "Docker Compose V2: $(docker compose version --short 2>/dev/null || echo 'OK')"
elif command -v docker-compose &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
    log_ok "Docker Compose V1: $(docker-compose --version | head -1)"
else
    log_err "Docker Compose não encontrado!"
    echo "  Instale com: sudo apt install docker-compose-plugin"
    exit 1
fi

# Verificar permissão Docker
if ! docker info &> /dev/null 2>&1; then
    log_err "Sem permissão para usar Docker."
    echo "  Execute com sudo ou faça logout/login após: sudo usermod -aG docker \$USER"
    exit 1
fi

# ── 4. Verificar espaço e recursos ──
log_step "4/9" "Verificando recursos do servidor..."

# Disco
AVAILABLE_GB=$(df "$PROJECT_DIR" --output=avail -BG 2>/dev/null | tail -1 | tr -d ' G' || echo "999")
if [ "$AVAILABLE_GB" -lt 2 ] 2>/dev/null; then
    log_err "Espaço em disco insuficiente: ${AVAILABLE_GB}GB (mínimo 2GB)"
    exit 1
fi
log_ok "Espaço em disco: ${AVAILABLE_GB}GB disponível"

# RAM
TOTAL_RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "0")
if [ "$TOTAL_RAM_MB" -lt 512 ] 2>/dev/null; then
    log_warn "RAM baixa: ${TOTAL_RAM_MB}MB (recomendado: 1GB+)"
else
    log_ok "RAM: ${TOTAL_RAM_MB}MB"
fi

# ── 5. Verificar conflito de portas ──
log_step "5/9" "Verificando portas em uso..."

# Listar containers Docker rodando
RUNNING_CONTAINERS=$(docker ps --format '{{.Names}} → {{.Ports}}' 2>/dev/null || echo "nenhum")
if [ "$RUNNING_CONTAINERS" != "nenhum" ] && [ -n "$RUNNING_CONTAINERS" ]; then
    echo -e "  ${BLUE}Containers em execução:${NC}"
    echo "$RUNNING_CONTAINERS" | while read -r line; do
        echo -e "    📦 $line"
    done
fi

# Verificar serviços na porta 80
PORT80_PID=$(sudo lsof -ti:80 2>/dev/null | head -1 || true)
if [ -n "$PORT80_PID" ]; then
    PORT80_SERVICE=$(ps -p "$PORT80_PID" -o comm= 2>/dev/null || echo "desconhecido")
    log_ok "Porta 80 em uso por: ${PORT80_SERVICE} (PID: ${PORT80_PID}) — NÃO será alterado"
else
    log_ok "Porta 80 livre"
fi

# ── 6. Verificar arquivos do projeto ──
log_step "6/9" "Verificando arquivos do projeto..."

REQUIRED_FILES=(
    "$PROJECT_DIR/package.json"
    "$SCRIPT_DIR/Dockerfile"
    "$SCRIPT_DIR/nginx.conf"
    "$SCRIPT_DIR/docker-compose.yml"
    "$SCRIPT_DIR/.env.example"
)
for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        log_err "Arquivo não encontrado: $f"
        exit 1
    fi
done
log_ok "Todos os arquivos necessários encontrados"

# ── 7. Configurar .env ──
log_step "7/9" "Configurando variáveis de ambiente..."
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    log_ok "Arquivo .env criado a partir do .env.example"

    # Perguntar porta
    echo ""
    echo -e "  ${YELLOW}ATENÇÃO: A porta 80 provavelmente já está em uso.${NC}"
    echo -e "  O SimplyNvest precisa de uma porta diferente."
    echo ""
    read -r -p "  Porta para o T2-Simplynvest (padrão 3080): " CUSTOM_PORT
    CUSTOM_PORT=${CUSTOM_PORT:-3080}

    # Validar número
    if ! [[ "$CUSTOM_PORT" =~ ^[0-9]+$ ]] || [ "$CUSTOM_PORT" -lt 1024 ] || [ "$CUSTOM_PORT" -gt 65535 ]; then
        log_err "Porta inválida: $CUSTOM_PORT (use entre 1024-65535)"
        exit 1
    fi

    # Verificar se porta está em uso
    if sudo lsof -ti:"$CUSTOM_PORT" &>/dev/null; then
        USED_BY=$(sudo lsof -ti:"$CUSTOM_PORT" 2>/dev/null | head -1)
        USED_SERVICE=$(ps -p "$USED_BY" -o comm= 2>/dev/null || echo "desconhecido")
        log_err "Porta ${CUSTOM_PORT} já em uso por: ${USED_SERVICE}"
        read -r -p "  Escolha outra porta: " CUSTOM_PORT
        if ! [[ "$CUSTOM_PORT" =~ ^[0-9]+$ ]] || [ "$CUSTOM_PORT" -lt 1024 ] || [ "$CUSTOM_PORT" -gt 65535 ]; then
            log_err "Porta inválida: $CUSTOM_PORT"
            exit 1
        fi
    fi

    sed -i "s/APP_PORT=3080/APP_PORT=${CUSTOM_PORT}/" "$ENV_FILE"
    log_ok "Porta configurada: ${CUSTOM_PORT}"
else
    log_ok "Arquivo .env já existe"
fi

# Proteger .env
chmod 600 "$ENV_FILE"

# Carregar variáveis
set -a
source "$ENV_FILE"
set +a
APP_PORT=${APP_PORT:-3080}

# Verificação final de conflito de porta
if docker ps --format '{{.Ports}}' 2>/dev/null | grep -q "0.0.0.0:${APP_PORT}->"; then
    CONFLICTING=$(docker ps --format '{{.Names}}' --filter "publish=${APP_PORT}" 2>/dev/null | head -1)
    if [ "$CONFLICTING" != "simplynvest-app" ]; then
        log_err "Porta ${APP_PORT} em uso pelo container: ${CONFLICTING}"
        echo "  Altere APP_PORT no arquivo $ENV_FILE e tente novamente."
        exit 1
    fi
fi

# ── 8. Build e deploy ──
log_step "8/9" "Parando container anterior (se existir)..."
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^simplynvest-app$"; then
    cd "$SCRIPT_DIR" && $COMPOSE_CMD --env-file "$ENV_FILE" down 2>/dev/null || true
    log_ok "Container anterior removido"
else
    log_ok "Nenhuma instalação anterior"
fi

echo ""
log_step "8/9" "Construindo imagem Docker (pode levar 2-5 minutos)..."
cd "$SCRIPT_DIR" && $COMPOSE_CMD --env-file "$ENV_FILE" build --no-cache 2>&1 | tail -10
log_ok "Imagem construída com sucesso"

echo ""
log_step "8/9" "Iniciando T2-Simplynvest na porta ${APP_PORT}..."
cd "$SCRIPT_DIR" && $COMPOSE_CMD --env-file "$ENV_FILE" up -d
sleep 3
log_ok "Container iniciado"

# ── 9. Health check ──
log_step "9/9" "Verificando se o sistema está respondendo..."

MAX_RETRIES=20
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${APP_PORT}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log_ok "T2-Simplynvest respondendo com HTTP 200!"
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
    docker ps -a --filter "name=simplynvest-app" --format "  {{.Names}} | Status: {{.Status}}" 2>/dev/null
    echo ""
    echo -e "  Últimos logs:"
    docker logs simplynvest-app --tail 30 2>&1 | sed 's/^/  /'
    echo ""
    echo -e "${YELLOW}  Tente: docker logs simplynvest-app${NC}"
    exit 1
fi

# Verificar que outros containers não foram afetados
echo ""
echo -e "${BLUE}  ── Verificação de coexistência ──${NC}"
OTHER_CONTAINERS=$(docker ps --format '{{.Names}} → {{.Status}}' --filter "status=running" 2>/dev/null | grep -v simplynvest || true)
if [ -n "$OTHER_CONTAINERS" ]; then
    echo -e "  ${GREEN}Outros containers rodando normalmente:${NC}"
    echo "$OTHER_CONTAINERS" | while read -r line; do
        echo -e "    ✓ $line"
    done
else
    echo -e "  Nenhum outro container em execução."
fi

# ── Resultado Final ──
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP")

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ T2-Simplynvest instalado com sucesso!${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Acesso direto:  ${GREEN}http://${SERVER_IP}:${APP_PORT}${NC}"
echo -e "  🌐 Acesso local:   ${GREEN}http://localhost:${APP_PORT}${NC}"
echo ""
echo -e "  ${BLUE}── Próximos passos (Reverse Proxy) ──${NC}"
echo -e "  Para acessar via domínio sem porta (ex: simplynvest.t2systems.com.br):"
echo -e "  ${YELLOW}1.${NC} Copie o proxy reverso:"
echo -e "     ${YELLOW}sudo cp $SCRIPT_DIR/simplynvest-proxy.conf /etc/nginx/sites-available/simplynvest${NC}"
echo -e "  ${YELLOW}2.${NC} Ative:"
echo -e "     ${YELLOW}sudo ln -sf /etc/nginx/sites-available/simplynvest /etc/nginx/sites-enabled/simplynvest${NC}"
echo -e "  ${YELLOW}3.${NC} Teste e recarregue (NÃO reinicia o Nginx existente):"
echo -e "     ${YELLOW}sudo nginx -t && sudo systemctl reload nginx${NC}"
echo -e "  ${YELLOW}4.${NC} SSL com Let's Encrypt (opcional):"
echo -e "     ${YELLOW}sudo certbot --nginx -d simplynvest.t2systems.com.br${NC}"
echo ""
echo -e "  📋 Comandos úteis:"
echo -e "  ${YELLOW}docker logs simplynvest-app -f${NC}           → Ver logs em tempo real"
echo -e "  ${YELLOW}docker restart simplynvest-app${NC}           → Reiniciar"
echo -e "  ${YELLOW}docker stats simplynvest-app${NC}             → Uso de CPU/RAM"
echo -e "  ${YELLOW}cd docker && $COMPOSE_CMD down${NC}        → Parar"
echo -e "  ${YELLOW}cd docker && $COMPOSE_CMD up -d${NC}       → Iniciar"
echo -e "  ${YELLOW}cd docker && bash install.sh${NC}          → Reinstalar"
echo -e "  ${YELLOW}cd docker && bash uninstall.sh${NC}        → Desinstalar"
echo -e "  ${YELLOW}cd docker && bash setup-backup.sh${NC}     → Configurar backup automático"
echo ""
echo -e "  ⚠️  Seus outros sistemas na porta 80 NÃO foram alterados."
echo ""
echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
