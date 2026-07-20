# Diagnóstico e Monitoramento de 403 — SimplyNvest

Dois scripts em `scripts/` cobrem o problema completo:

- **`diagnose-403.sh`** — coleta on-demand: status do container, HTTP interno/externo, config nginx ativa, últimas linhas de `error.log`, permissões, e imprime uma **causa provável automática**. Gera relatório em `/var/log/simplynvest/diagnose-YYYYMMDD-HHMMSS.log`.
- **`monitor-403.sh`** — rodada por cron (2 em 2 min). Se o domínio retornar 403/5xx/offline **em duas checagens seguidas**, dispara alerta Telegram com resumo + trecho do log, e chama o `diagnose-403.sh` em background. Envia "recuperou" quando volta ao normal. Cooldown de 30 min evita spam.

## Instalação na VPS (uma vez)

```bash
# 1. Sincronize os scripts (via git pull ou rsync)
cd /opt/simplynvest && git pull
chmod +x scripts/diagnose-403.sh scripts/monitor-403.sh

# 2. Configure o env do monitor
sudo mkdir -p /etc/simplynvest
sudo tee /etc/simplynvest/monitor.env >/dev/null <<'EOF'
DOMAIN=simplynvest.t2systems.com.br
TELEGRAM_BOT_TOKEN=SEU_TOKEN_AQUI
TELEGRAM_CHAT_ID=SEU_CHAT_ID_AQUI
EOF
sudo chmod 600 /etc/simplynvest/monitor.env

# 3. Diretórios de log/estado
sudo mkdir -p /var/log/simplynvest /var/lib/simplynvest

# 4. Agende no cron (root, para ler nginx logs)
sudo crontab -e
# adicione:
*/2 * * * * /opt/simplynvest/scripts/monitor-403.sh >> /var/log/simplynvest/monitor.log 2>&1
```

## Uso manual

```bash
# Diagnóstico completo agora
sudo bash /opt/simplynvest/scripts/diagnose-403.sh

# Ver últimos relatórios
ls -lt /var/log/simplynvest/diagnose-*.log | head

# Ver log do monitor
tail -f /var/log/simplynvest/monitor.log
```

## Descobrir o `TELEGRAM_CHAT_ID`

```bash
# Envie qualquer mensagem para o seu bot, então:
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"id":[0-9]*' | head -1
```
