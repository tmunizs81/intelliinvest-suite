/**
 * Suíte de contrato de segurança.
 *
 * Não sobe as funções: varre o código-fonte e garante, de forma estática, que
 * nenhuma rota sensível volte a ficar aberta ou volte a derivar identidade de
 * um JWT não verificado. Roda em milissegundos e quebra o build na hora em que
 * alguém criar uma função nova sem guard.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyTelegramSecret, requireCron, functionNameOf } from "./auth.ts";

const FUNCTIONS_DIR = new URL("../", import.meta.url).pathname;

/** Rotas públicas por decisão de produto (não expõem dado de usuário). */
const PUBLIC_ALLOWLIST = new Set<string>([
  "health-check",
]);

/** Rotas que exigem sessão de usuário (não aceitam apenas cron secret). */
const USER_ONLY = new Set<string>([
  "ai-trader",
  "admin-create-user",
  "admin-user-manager",
  "telegram-license-notify",
]);

/** Rotas autenticadas pelo secret token do Telegram. */
const TELEGRAM_ROUTES = new Set<string>(["telegram-webhook"]);

/** Rotas caras que precisam de cota persistida. */
const RATE_LIMITED_ROUTES = new Set<string>([
  "ai-trader",
  "ai-insights",
  "ai-pattern-detector",
  "ai-router",
  "telegram-webhook",
]);

async function listFunctions(): Promise<Array<{ name: string; source: string }>> {
  const out: Array<{ name: string; source: string }> = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    const path = `${FUNCTIONS_DIR}${entry.name}/index.ts`;
    try {
      out.push({ name: entry.name, source: await Deno.readTextFile(path) });
    } catch {
      /* diretório sem index.ts */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const GUARD_RE =
  /(requireUser|requireCaller|resolveCaller|requireCron|verifyTelegramSecret|requireTelegramSecret|getUser\s*\(|getClaims\s*\()/;

Deno.test("toda edge function sensível possui um guard de autenticação", async () => {
  const fns = await listFunctions();
  assert(fns.length > 0, "nenhuma função encontrada — caminho errado?");

  const unguarded = fns
    .filter((f) => !PUBLIC_ALLOWLIST.has(f.name))
    .filter((f) => !GUARD_RE.test(f.source))
    .map((f) => f.name);

  assertEquals(
    unguarded,
    [],
    `Funções sem guard de autenticação: ${unguarded.join(", ")}. ` +
      `Adicione requireUser/resolveCaller/requireCron ou inclua em PUBLIC_ALLOWLIST com justificativa.`,
  );
});

Deno.test("rotas de usuário não aceitam apenas o cron secret", async () => {
  const fns = await listFunctions();
  for (const name of USER_ONLY) {
    const fn = fns.find((f) => f.name === name);
    assert(fn, `função ${name} não encontrada`);
    assert(
      /requireUser|getClaims/.test(fn!.source),
      `${name} deve exigir requireUser (sessão real), não apenas requireCaller/cron`,
    );
  }
});

Deno.test("nenhuma função deriva identidade de JWT não verificado (atob)", async () => {
  const fns = await listFunctions();
  const offenders = fns
    .filter((f) => /atob\s*\([^)]*\)/.test(f.source) && /sub\b/.test(f.source))
    .map((f) => f.name);

  assertEquals(
    offenders,
    [],
    `Identidade forjável via atob(jwt) em: ${offenders.join(", ")}. ` +
      `Use resolveCaller(req).subjectId.`,
  );
});

Deno.test("rotas caras aplicam rate limit persistido", async () => {
  const fns = await listFunctions();
  for (const name of RATE_LIMITED_ROUTES) {
    const fn = fns.find((f) => f.name === name);
    assert(fn, `função ${name} não encontrada`);
    assert(
      /enforceRateLimit|consumeRateLimit/.test(fn!.source),
      `${name} precisa de rate limit persistido (enforceRateLimit)`,
    );
  }
});

Deno.test("webhook do Telegram valida o secret token", async () => {
  const fns = await listFunctions();
  for (const name of TELEGRAM_ROUTES) {
    const fn = fns.find((f) => f.name === name);
    assert(fn, `função ${name} não encontrada`);
    assert(
      /verifyTelegramSecret|requireTelegramSecret/.test(fn!.source),
      `${name} precisa validar X-Telegram-Bot-Api-Secret-Token`,
    );
  }
});

// ─── Testes unitários dos guards ───

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/functions/v1/ai-trader", {
    method: "POST",
    headers,
  });
}

Deno.test("requireCron rejeita chamada sem header", () => {
  Deno.env.set("CRON_SECRET", "secret-atual");
  const res = requireCron(reqWith(), { audit: false });
  assert(res instanceof Response);
  assertEquals(res!.status, 401);
});

Deno.test("requireCron aceita o secret atual e o anterior (rotação)", () => {
  Deno.env.set("CRON_SECRET", "secret-atual");
  Deno.env.set("CRON_SECRET_PREVIOUS", "secret-antigo");

  assertEquals(requireCron(reqWith({ "x-cron-secret": "secret-atual" }), { audit: false }), null);
  assertEquals(requireCron(reqWith({ "x-cron-secret": "secret-antigo" }), { audit: false }), null);

  const bad = requireCron(reqWith({ "x-cron-secret": "chute" }), { audit: false });
  assert(bad instanceof Response);
});

Deno.test("verifyTelegramSecret identifica qual slot foi usado", () => {
  Deno.env.set("TELEGRAM_WEBHOOK_SECRET", "tg-novo");
  Deno.env.set("TELEGRAM_WEBHOOK_SECRET_PREVIOUS", "tg-velho");

  const atual = verifyTelegramSecret(reqWith({ "x-telegram-bot-api-secret-token": "tg-novo" }));
  assert(!(atual instanceof Response));
  assertEquals((atual as { keyId: string }).keyId, "telegram_current");

  const anterior = verifyTelegramSecret(reqWith({ "x-telegram-bot-api-secret-token": "tg-velho" }));
  assert(!(anterior instanceof Response));
  assertEquals((anterior as { keyId: string }).keyId, "telegram_previous");
});

Deno.test("functionNameOf extrai o nome da rota", () => {
  assertEquals(functionNameOf(reqWith()), "ai-trader");
});
