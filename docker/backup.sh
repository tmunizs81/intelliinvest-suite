#!/bin/bash
# ══════════════════════════════════════════
#  T2-Simplynvest - Backup Automático
#  Salva configurações e estado do container
# ══════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="investai_backup_${TIMESTAMP}"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
MAX_BACKUPS=7  # Manter últimos 7 backups

mkdir -p "$BACKUP_PATH"

echo -e "${YELLOW}[InvestAI Backup] Iniciando backup...${NC}"

# 1. Backup do .env
if [ -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env" "$BACKUP_PATH/.env"
    echo -e "${GREEN}  ✓ .env${NC}"
fi

# 2. Backup do docker-compose.yml
cp "$SCRIPT_DIR/docker-compose.yml" "$BACKUP_PATH/docker-compose.yml"
echo -e "${GREEN}  ✓ docker-compose.yml${NC}"

# 3. Backup do nginx.conf
cp "$SCRIPT_DIR/nginx.conf" "$BACKUP_PATH/nginx.conf"
echo -e "${GREEN}  ✓ nginx.conf${NC}"

# 4. Info do container
docker inspect investai-app > "$BACKUP_PATH/container_info.json" 2>/dev/null || echo "{}" > "$BACKUP_PATH/container_info.json"
echo -e "${GREEN}  ✓ container info${NC}"

# 5. Logs recentes
docker logs investai-app --tail 500 > "$BACKUP_PATH/container_logs.txt" 2>&1 || true
echo -e "${GREEN}  ✓ logs${NC}"

# 6. Compactar
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_PATH"
echo -e "${GREEN}  ✓ Compactado: ${BACKUP_NAME}.tar.gz${NC}"

# 7. Limpar backups antigos (manter apenas os últimos N)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    EXCESS=$((BACKUP_COUNT - MAX_BACKUPS))
    ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n "$EXCESS" | xargs rm -f
    echo -e "${YELLOW}  → Removidos $EXCESS backups antigos${NC}"
fi

SIZE=$(du -sh "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | awk '{print $1}')
echo -e "${GREEN}✅ Backup concluído: ${BACKUP_NAME}.tar.gz (${SIZE})${NC}"
