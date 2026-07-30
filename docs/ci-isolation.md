# CI de isolamento e segredos

O workflow `.github/workflows/security-isolation.yml` roda em todo Pull Request para `main`
e bloqueia o merge se houver regressão de isolamento entre contas ou vazamento de segredo.

## O que é executado

| Job | Conteúdo | Bloqueia merge |
| --- | --- | --- |
| `static-security` | typecheck, `test:security` (multi-tenancy + cache escopado), suíte completa de testes, varredura por bot token / uso da publishable key como bearer | sim |
| `e2e-isolation` | build + preview local e `user-isolation.e2e.ts` (logout limpa cache, troca de conta não vaza holdings, respostas de API da conta B nunca contêm o id da conta A, nenhum `bot_token` trafega) | sim |
| `isolation-gate` | agrega os dois jobs em um único status para o branch protection | sim |

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
