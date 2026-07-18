# Auto-Deploy VPS (Docker Compose)

Sync automática do GitHub `tmunizs81/intelliinvest-suite` (branch `main`) para a VPS.
Repositório em `/opt/simplynvest`, compose em `/opt/simplynvest/docker`.

---

## 1. Chave SSH de deploy

Na sua máquina (ou VPS):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/lovable_deploy -N "" -C "lovable-deploy"
```

Na VPS, autorize a chave pública:
```bash
cat lovable_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## 2. Docker sem sudo para o usuário de deploy

```bash
sudo usermod -aG docker $USER
# faça logout/login para aplicar
```

Se preferir manter root, use `VPS_USER=root` no passo 3.

## 3. Secrets no GitHub

Repo `intelliinvest-suite` → **Settings → Secrets and variables → Actions**:

| Secret         | Valor                          |
|----------------|--------------------------------|
| `VPS_HOST`     | IP ou domínio da VPS           |
| `VPS_USER`     | `root` (ou usuário do docker)  |
| `VPS_PORT`     | 22 (opcional)                  |
| `VPS_SSH_KEY`  | conteúdo de `lovable_deploy`   |
| `VPS_APP_PATH` | `/opt/simplynvest`             |

## 4. Pronto

Todo push em `main` roda o workflow `.github/workflows/deploy-vps.yml`:
```
cd /opt/simplynvest
git pull
cd docker
docker compose down && docker compose build && docker compose up -d
```

Acompanhe em: https://github.com/tmunizs81/intelliinvest-suite/actions

## Deploy manual

```bash
cd /opt/simplynvest
bash scripts/deploy-vps.sh
```

## Diagnóstico

```bash
cd /opt/simplynvest && git log -1 --oneline    # commit em produção
cd /opt/simplynvest/docker && docker compose ps # containers
docker compose logs -f --tail=100               # logs em tempo real
```

Se o Actions passar mas o navegador mostrar versão antiga: cache do browser (Ctrl+Shift+R) ou cache do próprio nginx/CDN dentro do container.
