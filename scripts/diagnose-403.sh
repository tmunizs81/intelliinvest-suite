#!/usr/bin/env bash
# ============================================
# SimplyNvest — Diagnóstico automático de 403
# ============================================
# Coleta: status do container, health do proxy nginx, últimas linhas
# do error.log e resposta HTTP dos endpoints principais.
# Gera um relatório em /var/log/simplynvest/diagnose-YYYYMMDD-HHMMSS.log
#
# Uso:
#   sudo bash scripts/diagnose-403.sh [dominio]
#   sudo bash scripts/diagnose-403.sh simplynvest.t2systems.com.br
# ============================================
set -uo pipefail

DOMAIN="${1:-simplynvest.t2systems.com.br}"
CONTAINER_PORT="${CONTAINER_PORT:-3080}"
CONTAINER_NAME_PATTERN="${CONTAINER_NAME_PATTERN:-simply}"
OUT_DIR="/var/log/simplynvest"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$OUT_DIR/diagnose-$STAMP.log"

section() { printf "\n\n===== %s =====\n" "$1" | tee -a "$OUT"; }
run()     { printf "\n$ %s\n" "$*" | tee -a "$OUT"; eval "$@" 2>&1 | tee -a "$OUT"; }

{
  echo "SimplyNvest Diagnóstico 403"
  echo "Data:     $(date -Iseconds)"
  echo "Host:     $(hostname)"
  echo "Domínio:  $DOMAIN"
  echo "Porta:    $CONTAINER_PORT"
} | tee "$OUT"

section "1. Container Docker"
run "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -i '$CONTAINER_NAME_PATTERN' || echo 'Container NÃO ENCONTRADO'"

section "2. Healthcheck interno (127.0.0.1:$CONTAINER_PORT)"
run "curl -sS -o /dev/null -w 'HTTP %{http_code} — %{time_total}s\n' --max-time 8 http://127.0.0.1:$CONTAINER_PORT/ || echo 'FALHA ao conectar no container'"

section "3. Resposta pública do domínio"
run "curl -sSIL --max-time 10 http://$DOMAIN/ | head -20 || echo 'FALHA'"
run "curl -sSIL --max-time 10 https://$DOMAIN/ | head -20 || echo 'sem HTTPS'"

section "3.1. Hard refresh / cache bypass"
run "curl -sSIL --max-time 10 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' http://$DOMAIN/ | head -20 || echo 'FALHA'"
run "curl -sSIL --max-time 10 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' https://$DOMAIN/ | head -20 || echo 'sem HTTPS'"
run "curl -sSIL --max-time 10 -H 'Cache-Control: no-cache' https://$DOMAIN/assets/nonexistent-hard-refresh-test.js | head -20 || true"

section "4. Nginx: config ativa para o domínio"
run "sudo nginx -T 2>/dev/null | grep -A35 -B3 '$DOMAIN' | head -120 || true"
run "sudo nginx -T 2>/dev/null | awk '/server_name[[:space:]].*'$DOMAIN'/{flag=1} flag{print} flag && /}/{flag=0}' | grep -nE 'listen|server_name|root|alias|try_files|proxy_pass|ssl_certificate' || true"
run "ls -la /etc/nginx/sites-enabled/ 2>/dev/null | grep -i simply || echo 'proxy simplynvest NÃO ativado em sites-enabled'"

section "5. Últimas 30 linhas de error.log"
for f in "/var/log/nginx/simplynvest-error.log" "/var/log/nginx/error.log"; do
  if [ -f "$f" ]; then
    section "  → $f"
    run "sudo tail -30 '$f'"
  fi
done

section "6. Últimas 30 linhas de access.log (procurando 403)"
for f in "/var/log/nginx/simplynvest-access.log" "/var/log/nginx/access.log"; do
  if [ -f "$f" ]; then
    section "  → $f (últimos 403)"
    run "sudo tail -200 '$f' | grep ' 403 ' | tail -20 || echo 'Nenhum 403 recente'"
  fi
done

section "7. Permissões do diretório servido"
run "ls -la /opt/simplynvest/docker/ 2>/dev/null | head -15 || echo 'path não encontrado'"

section "8. Diagnóstico automático"
STATUS_INT=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$CONTAINER_PORT/" 2>/dev/null || echo "000")
STATUS_EXT=$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 10 "http://$DOMAIN/" 2>/dev/null || echo "000")
STATUS_EXT_NOCACHE=$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 10 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://$DOMAIN/" 2>/dev/null || echo "000")
CONTAINER_UP=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c -i "$CONTAINER_NAME_PATTERN")
PROXY_ACTIVE=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -c -i simply)
SSL_ROOT_MISCONFIG=$(sudo nginx -T 2>/dev/null | awk '/server_name[[:space:]].*'$DOMAIN'/{flag=1} flag{print} flag && /}/{flag=0}' | grep -Ec 'root[[:space:]]|alias[[:space:]]|try_files[[:space:]]' || true)

{
  echo ""
  echo "Container up:       $CONTAINER_UP (esperado ≥1)"
  echo "HTTP interno:       $STATUS_INT (esperado 200)"
  echo "HTTP externo:       $STATUS_EXT (esperado 200)"
  echo "HTTPS no-cache:     $STATUS_EXT_NOCACHE (Ctrl+Shift+R esperado 200)"
  echo "Proxy ativado:      $PROXY_ACTIVE (esperado 1)"
  echo "Root/try_files host:$SSL_ROOT_MISCONFIG (esperado 0 no bloco do domínio)"
  echo ""
  if [ "$CONTAINER_UP" = "0" ]; then
    echo ">>> CAUSA PROVÁVEL: container parado. Rode: cd /opt/simplynvest/docker && docker compose up -d"
  elif [ "$STATUS_INT" != "200" ]; then
    echo ">>> CAUSA PROVÁVEL: container respondendo mal. Veja: docker compose logs --tail=50"
  elif [ "$PROXY_ACTIVE" = "0" ]; then
    echo ">>> CAUSA PROVÁVEL: proxy nginx do domínio não está ativado em sites-enabled."
    echo "    Rode: sudo ln -sf /etc/nginx/sites-available/simplynvest /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx"
  elif [ "$STATUS_EXT_NOCACHE" = "403" ]; then
    echo ">>> CAUSA PROVÁVEL: o bloco HTTPS (:443) do Nginx host está servindo diretório local/default no hard refresh."
    echo "    Corrija /etc/nginx/sites-available/simplynvest para proxy_pass http://127.0.0.1:$CONTAINER_PORT em 80 e 443."
    echo "    Remova root/alias/try_files desse server block, teste: sudo nginx -t && sudo systemctl reload nginx"
  elif [ "$STATUS_EXT" = "403" ]; then
    echo ">>> CAUSA PROVÁVEL: nginx host servindo /var/www/html vazio ou default. Remova /etc/nginx/sites-enabled/default ou ajuste server_name/proxy_pass."
  elif [ "$STATUS_EXT" = "200" ]; then
    echo ">>> Tudo saudável."
  else
    echo ">>> Status inesperado ($STATUS_EXT). Cheque os logs acima."
  fi
} | tee -a "$OUT"

echo ""
echo "Relatório salvo em: $OUT"
