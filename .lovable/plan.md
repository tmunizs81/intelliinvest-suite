
# Alertas Telegram + Gestão de Usuários

Divido em 5 entregas coesas. Aprovando, executo tudo em sequência.

---

## 1. Infra Telegram (backend)

Uso o **connector Telegram da Lovable** (gateway) — sem tokens no código, sem webhook (só envio outbound).

**Novas tabelas:**
- `telegram_bindings` — vincula `user_id` ↔ `chat_id` (via `/start CODIGO` no bot). Colunas: `user_id`, `chat_id`, `linked_at`, `active`.
- `alert_rules` — regras por usuário. Colunas: `user_id`, `kind` (`patrimony_drop`, `patrimony_gain`, `daily_valuation`, `roi_threshold`, `fx_stale`, `daily_summary`), `threshold_pct` NUMERIC, `threshold_minutes` INT, `enabled` BOOL, `channel` (`telegram`|`email`|`both`), `cooldown_minutes` INT (default 60).
- `notification_log` — cada disparo. Colunas: `user_id`, `rule_id`, `kind`, `payload` JSONB, `channel`, `status` (`sent`|`failed`|`suppressed_cooldown`), `error`, `sent_at`.

Todas com RLS `user_id = auth.uid()` + GRANTs corretos.

---

## 2. Edge Functions (DeepSeek preservado — Telegram só transporte)

- `telegram-send` — helper interno. Envia mensagem via gateway, grava em `notification_log`, respeita cooldown por regra.
- `telegram-link` — gera código de 6 dígitos por 10min (usuário digita `/start CODIGO` no bot; endpoint valida e cria binding). Como não teremos webhook, criamos rota alternativa: usuário cola o `chat_id` obtido do bot `@userinfobot` — mais simples e sem webhook.
- `check-alert-rules` — cron a cada **10 min** (aproveitando `scheduled-price-refresh`). Para cada regra ativa:
  - lê snapshot atual vs anterior via `get_dashboard_bootstrap`
  - avalia condição (queda %, ganho %, ROI, FX stale)
  - se disparar e fora do cooldown → chama `telegram-send`
- `telegram-daily-summary` — cron **09:00 America/Sao_Paulo** (12:00 UTC). Para cada usuário com regra `daily_summary` ativa:
  - patrimônio atual + variação vs snapshot D-1
  - top 3 gainers / top 3 losers do dia
  - FX snapshot usado
  - link para /dashboard

---

## 3. Tela `/settings` → aba **Telegram** (nova)

- Campo `chat_id` + botão **Testar** (dispara "✅ Bot conectado" via `telegram-send`)
- Lista de **regras**, cada uma com switch ativo/inativo e campos:
  - Queda de patrimônio > `X%` (default 3%)
  - Ganho de patrimônio > `Y%` (default 5%)
  - Variação diária > `Z%`
  - ROI de ativo cruza `W%`
  - FX desatualizado há > `N min` (default 120)
  - Resumo diário 09:00
- Slider de **cooldown** global (15 / 60 / 240 min)

---

## 4. Tela `/settings` → aba **Notificações** (nova, ao lado de Telegram)

- Histórico paginado de `notification_log` (últimos 30 dias)
- Filtros: tipo, status, canal
- Badge colorido por status
- Botão **"Reenviar"** para status=failed
- Stats: enviadas / falhadas / suprimidas nos últimos 7d

---

## 5. Aba **Usuários** — CRUD de admin (imagem enviada)

Amplio o card atual com modal **Editar Usuário** acessado por menu `⋯` na linha:

- Editar nome, email (via `auth.admin.updateUserById`)
- **Resetar senha** (envia link mágico ou define senha temporária)
- Editar licença: tipo (`trial`/`monthly`/`annual`/`lifetime`), data de expiração, status
- Toggle admin (já existe)
- Toggle Telegram bind (revogar)
- **Excluir usuário** (soft delete com confirmação dupla)

Edge Function `admin-user-manager` com verificação `has_role(auth.uid(), 'admin')` — todas mutações passam por ela usando service_role.

---

## Detalhes técnicos

**Conector Telegram:**  
Chamo `standard_connectors--connect` com `connector_id: telegram`. Após vincular, `LOVABLE_API_KEY` + `TELEGRAM_API_KEY` ficam disponíveis nas Edge Functions.

**Formato mensagem (HTML):**
```text
🔴 <b>Alerta: Queda de Patrimônio</b>
Variação: -3,2% (últimas 24h)
Atual: R$ 245.320,00
Anterior: R$ 253.410,00
🔗 abrir dashboard
```

**Cron:**
- `check-alert-rules`: `*/10 * * * *`
- `telegram-daily-summary`: `0 12 * * *`

**Cooldown:** `notification_log` WHERE rule_id=X AND sent_at > now() - cooldown → suprime.

**Fluxo aprovação:** aprove o plano, aí:
1. Peço aprovação da migration (5 tabelas + RLS)
2. Peço para vincular o connector Telegram
3. Implemento Edge Functions + UI de uma vez

---

## Fora de escopo (posso adicionar depois se pedir)
- Webhook bidirecional (`/pause`, `/status` no chat)
- Alertas por ativo individual configuráveis por ticker
- Push web (já temos plano futuro)
