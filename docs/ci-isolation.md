# CI de isolamento e segredos

O workflow `.github/workflows/security-isolation.yml` roda em todo Pull Request para `main`
e bloqueia o merge se houver regressão de isolamento entre contas ou vazamento de segredo.

## O que é executado

| Job | Conteúdo | Bloqueia merge |
| --- | --- | --- |
| `setup` | instala dependências uma vez e aquece o cache do bun | — |
| `build` | build de produção cacheado por conteúdo de `src/`, publicado como artefato | — |
| `static-security` (matrix) | 4 checagens em paralelo: typecheck, `test:security`, suíte completa, varredura de segredos | sim |
| `e2e-isolation` | consome o artefato de build e roda `user-isolation.e2e.ts` (logout limpa cache, troca de conta não vaza holdings, respostas de API da conta B nunca contêm o id da conta A, nenhum `bot_token` trafega) | sim |
| `isolation-gate` | agrega os jobs em um único status para o branch protection | sim |

## Otimizações de tempo

- **Cache de dependências**: `~/.bun/install/cache` compartilhado por todos os jobs,
  com chave pelo lockfile.
- **Cache de build**: `dist` é cacheado pelo hash de `src/**`, `index.html` e configs —
  PRs que só mexem em testes ou docs pulam o `vite build` inteiro.
- **Cache do Chromium**: `~/.cache/ms-playwright` com chave pela versão do Playwright;
  em cache hit só as libs de sistema são instaladas.
- **Paralelismo**: as 4 checagens estáticas rodam simultaneamente (matrix) e em paralelo
  com o build; o E2E só depende do build.
- **Sem build duplicado**: o E2E baixa o artefato `dist` e serve estático, em vez de
  rebuildar.

### O que continua serial (de propósito)

O arquivo `user-isolation.e2e.ts` roda com `test.describe.configure({ mode: 'serial' })`
e `--workers=1`. A ordem *login A -> logout -> login B na mesma aba* é justamente o que o
teste verifica; paralelizar destruiria a garantia.

Se os secrets das contas de teste não estiverem configurados, o job E2E **falha
explicitamente** em vez de pular silenciosamente — assim uma regressão nunca passa
por falta de configuração.

## Secrets necessários no repositório

`Settings → Secrets and variables → Actions`:

- `TEST_USER_A`, `TEST_PASS_A` — conta de teste A (com pelo menos um ativo cadastrado)
- `TEST_USER_B`, `TEST_PASS_B` — conta de teste B (carteira diferente da A)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

Use contas dedicadas de QA, nunca contas reais de clientes.

## Tornar o gate obrigatório

`Settings → Branches → Branch protection rules → main`:

1. Marque **Require status checks to pass before merging**.
2. Selecione o check **Gate de isolamento**.
3. Marque **Require branches to be up to date before merging**.

## Rodando localmente

```bash
bun run test:security          # checagens estáticas de token/segredo e cache
TEST_USER_A=... TEST_PASS_A=... TEST_USER_B=... TEST_PASS_B=... \
  bun run test:e2e:isolation   # E2E sequencial das duas contas
```
