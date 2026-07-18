# Auto-Deploy VPS (Ubuntu 24.04)

Sync automática do GitHub `tmunizs81/intelliinvest-suite` (branch `main`) para a VPS self-hosted.

---

## Opção 1 — GitHub Actions com SSH (recomendado)

### 1. Gere uma chave SSH exclusiva para deploy (na sua máquina local ou na VPS):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/lovable_deploy -N "" -C "lovable-deploy"
```

### 2. Autorize a chave pública na VPS:
```bash
# na VPS, como o usuário que vai fazer o deploy (ex.: deploy)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat lovable_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 3. Permita `systemctl reload nginx` sem senha:
```bash
sudo visudo -f /etc/sudoers.d/deploy-nginx
# adicione:
deploy ALL=(root) NOPASSWD: /bin/systemctl reload nginx
```

### 4. No GitHub → repo `intelliinvest-suite` → Settings → Secrets and variables → Actions, adicione:

| Secret            | Valor                                         |
|-------------------|-----------------------------------------------|
| `VPS_HOST`        | IP ou domínio da VPS                          |
| `VPS_USER`        | usuário SSH (ex.: `deploy`)                   |
| `VPS_PORT`        | porta SSH (opcional, default 22)              |
| `VPS_SSH_KEY`     | conteúdo da chave privada `lovable_deploy`    |
| `VPS_APP_PATH`    | caminho do app (ex.: `/var/www/simplynvest`)  |

### 5. Prepare a VPS (uma vez):
```bash
sudo mkdir -p /var/www/simplynvest
sudo chown -R $USER:$USER /var/www/simplynvest
cd /var/www/simplynvest
git clone https://github.com/tmunizs81/intelliinvest-suite.git .
curl -fsSL https://bun.sh/install | bash   # opcional, ou use npm
bun install && bun run build
```

Configure o Nginx para servir `/var/www/simplynvest/dist` com fallback SPA:
```nginx
server {
  listen 80;
  server_name seu-dominio.com;
  root /var/www/simplynvest/dist;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  gzip_static on;
  location ~* \.(js|css|woff2|png|jpg|svg)$ {
    expires 1y; add_header Cache-Control "public, immutable";
  }
}
```

### 6. Pronto
Todo `push` do Lovable para `main` dispara `.github/workflows/deploy-vps.yml`, que executa `git pull + build + reload nginx` na VPS.

---

## Opção 2 — Deploy manual

Na VPS:
```bash
cd /var/www/simplynvest
bash scripts/deploy-vps.sh
```

## Diagnóstico

```bash
# ver se o commit chegou
cd /var/www/simplynvest && git log -1 --oneline

# ver logs do Actions
# https://github.com/tmunizs81/intelliinvest-suite/actions
```

Se o Actions passar mas o site continuar antigo: navegador está com cache. Force reload (Ctrl+Shift+R) ou verifique cabeçalhos do Nginx.
