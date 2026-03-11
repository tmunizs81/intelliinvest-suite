#!/bin/bash
# ══════════════════════════════════════════
#  T2-Simplynvest - Configurar Backup Automático
#  Adiciona cron job para backup diário
# ══════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"

chmod +x "$BACKUP_SCRIPT"

# Horário padrão: 3h da manhã
CRON_HOUR=${1:-3}
CRON_ENTRY="0 ${CRON_HOUR} * * * ${BACKUP_SCRIPT} >> ${SCRIPT_DIR}/backups/cron.log 2>&1"

# Verificar se já existe
if crontab -l 2>/dev/null | grep -q "investai_backup"; then
    echo -e "${YELLOW}Cron de backup já configurado. Atualizando...${NC}"
    crontab -l 2>/dev/null | grep -v "backup.sh" | { cat; echo "$CRON_ENTRY # investai_backup"; } | crontab -
else
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY # investai_backup") | crontab -
fi

mkdir -p "$SCRIPT_DIR/backups"

echo -e "${GREEN}✅ Backup automático configurado!${NC}"
echo -e "  ⏰ Horário: todos os dias às ${CRON_HOUR}h"
echo -e "  📂 Local: ${SCRIPT_DIR}/backups/"
echo -e "  📋 Retenção: últimos 7 backups"
echo ""
echo -e "  Comandos:"
echo -e "  ${YELLOW}bash docker/backup.sh${NC}           → Backup manual agora"
echo -e "  ${YELLOW}bash docker/setup-backup.sh 5${NC}   → Mudar horário (ex: 5h)"
echo -e "  ${YELLOW}crontab -l${NC}                      → Ver agendamento"
