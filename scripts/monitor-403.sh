#!/usr/bin/env bash
# ============================================
# SimplyNvest — Monitor de 403 com alerta Telegram
# ============================================
# Faz check HTTP no domínio. Se retornar 403 (ou 5xx / offline)
# duas checagens seguidas, dispara alerta Telegram e roda o
# diagnose-403.sh anexando o resumo.
#
# Uso via cron (a cada 2 min):
#   */2 * * * * /opt/simplynvest/scripts/monitor-403.sh >> /var/log/simplynvest/monitor.log 2>&1
#
# Variáveis de ambiente esperadas (em /etc/simplynvest/monitor.env):
#   DOMAIN=simplynvest.t2systems.com.br
#   TELEGRAM_BOT_TOKEN=xxx
#   TELEGRAM_CHAT_ID=xxx
# ============================================
set -uo pipefail

ENV_FILE="${ENV_FILE:-/etc/simplynvest/monitor.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

DOMAIN="${DOMAIN:-simplynvest.t2systems.com.br}"
STATE_DIR="/var/lib/simplynvest"
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/monitor-403.state"
COOLDOWN_FILE="$STATE_DIR/monitor-403.cooldown"
COOLDOWN_SEC=1800   # 30 min entre alertas repetidos

STATUS=$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/" 2>/dev/null || echo "000")
NOW=$(date +%s)
NOW_HUMAN=$(date -Iseconds)

# Estado anterior
PREV_STATUS="000"
[ -f "$STATE_FILE" ] && PREV_STATUS=$(cat "$STATE_FILE")
echo "$STATUS" > "$STATE_FILE"

echo "[$NOW_HUMAN] $DOMAIN → $STATUS (prev=$PREV_STATUS)"

is_bad() {
  case "$1" in
    403|500|502|503|504|000) return 0 ;;
    *) return 1 ;;
  esac
}

send_telegram() {
  local msg="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    echo "  ⚠ Telegram não configurado (defina TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID em $ENV_FILE)"
    return
  fi
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${msg}" \
    --data-urlencode "parse_mode=HTML" \
    -o /dev/null -w "  Telegram HTTP %{http_code}\n"
}

# Só alerta se 2 checagens ruins seguidas (evita falso-positivo de rede)
if is_bad "$STATUS" && is_bad "$PREV_STATUS"; then
  # Respeita cooldown
  LAST_ALERT=0
  [ -f "$COOLDOWN_FILE" ] && LAST_ALERT=$(cat "$COOLDOWN_FILE")
  if [ $((NOW - LAST_ALERT)) -lt $COOLDOWN_SEC ]; then
    echo "  cooldown ativo, pulando alerta"
    exit 0
  fi

  # Coleta rápida
  CONTAINER=$(docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -i simply | head -1)
  [ -z "$CONTAINER" ] && CONTAINER="⚠ container não encontrado"
  ERRLOG=$(sudo tail -3 /var/log/nginx/simplynvest-error.log 2>/dev/null | sed 's/[<>&]//g' | head -c 500)
  [ -z "$ERRLOG" ] && ERRLOG="(sem entradas recentes)"

  MSG="🚨 <b>SimplyNvest — HTTP $STATUS</b>
Domínio: <code>$DOMAIN</code>
Hora: $NOW_HUMAN
Container: $CONTAINER

<b>Últimas linhas do nginx error.log:</b>
<pre>$ERRLOG</pre>

Rode: <code>sudo bash /opt/simplynvest/scripts/diagnose-403.sh</code>"

  send_telegram "$MSG"
  echo "$NOW" > "$COOLDOWN_FILE"

  # Dispara diagnóstico completo em background
  if [ -x "/opt/simplynvest/scripts/diagnose-403.sh" ]; then
    nohup bash /opt/simplynvest/scripts/diagnose-403.sh "$DOMAIN" > /dev/null 2>&1 &
  fi

# Recuperou depois de estar em falha
elif ! is_bad "$STATUS" && is_bad "$PREV_STATUS"; then
  send_telegram "✅ <b>SimplyNvest recuperou</b>
Domínio: <code>$DOMAIN</code>
Status: HTTP $STATUS
Hora: $NOW_HUMAN"
  rm -f "$COOLDOWN_FILE"
fi
