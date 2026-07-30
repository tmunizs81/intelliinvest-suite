/**
 * Invariantes de multi-tenancy verificadas por varredura do código-fonte.
 *
 * Objetivo: qualquer PR que reintroduza uma das falhas abaixo quebra o CI,
 * mesmo sem banco de dados disponível no runner:
 *
 *  1. Cache de navegador com dados pessoais precisa ser escopado por conta.
 *  2. Chamadas a Edge Functions não podem usar a publishable key como bearer
 *     (isso derruba a identidade do chamador e quebra o rate limit por usuário).
 *  3. Edge Functions não podem confiar em `user_id` vindo do corpo da requisição.
 *  4. Nenhuma policy do banco pode liberar leitura com condição sempre verdadeira.
 *  5. O bot_token do Telegram não pode ser lido por rotas administrativas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

const SRC_FILES = walk("src", [".ts", ".tsx"]).filter((f) => !f.includes(".test."));
const FUNCTION_FILES = walk("supabase/functions", [".ts"]);
const MIGRATIONS = walk("supabase/migrations", [".sql"]);

const read = (f: string) => readFileSync(f, "utf8");

describe("isolamento — cache do navegador", () => {
  it("toda leitura de cache pessoal informa o dono da entrada", () => {
    const PERSONAL = /getCached<[^>]*>?\(\s*[^)]*?(ai-insights|ai-advisor|dashboard_bootstrap|portfolio_metrics)/;
    const offenders: string[] = [];

    for (const file of SRC_FILES) {
      const content = read(file);
      for (const line of content.split("\n")) {
        if (!line.includes("getCached")) continue;
        if (!PERSONAL.test(line) && !line.includes("userScopedKey")) continue;
        if (!line.includes("owner")) offenders.push(`${file}: ${line.trim()}`);
      }
    }

    expect(offenders, "cache pessoal lido sem validar o dono").toEqual([]);
  });

  it("chaves de IA e dashboard passam por userScopedKey", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      for (const line of read(file).split("\n")) {
        const isKeyDef = /cacheKey\s*=/.test(line);
        const isPersonal = /(ai-insights|ai-advisor|dashboard_bootstrap|portfolio_metrics)/.test(line);
        if (isKeyDef && isPersonal && !line.includes("userScopedKey")) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "chave de cache pessoal sem escopo de usuário").toEqual([]);
  });
});

describe("isolamento — autenticação das chamadas ao backend", () => {
  it("nenhuma chamada usa a publishable key como token de sessão", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      for (const line of read(file).split("\n")) {
        if (/Authorization[^\n]*Bearer[^\n]*PUBLISHABLE_KEY/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "publishable key usada como bearer (identidade perdida)").toEqual([]);
  });

  it("chamadas diretas a /functions/v1 enviam o access_token da sessão", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const content = read(file);
      if (!content.includes("/functions/v1")) continue;
      if (!content.includes("fetch(")) continue;
      if (!content.includes("access_token")) offenders.push(file);
    }
    expect(offenders, "fetch a edge function sem token de sessão").toEqual([]);
  });
});

describe("isolamento — Edge Functions", () => {
  const SKIP = ["_shared", "telegram-webhook", "job-worker", "index.test"];

  it("nenhuma função deriva identidade de atob(jwt) ou do corpo da requisição", () => {
    const offenders: string[] = [];
    for (const file of FUNCTION_FILES) {
      const content = read(file);
      if (/atob\(\s*(token|jwt|authHeader)/.test(content)) {
        offenders.push(`${file}: decodifica JWT manualmente`);
      }
      // user_id vindo do body só é aceitável se houver verificação da identidade.
      const usesBodyUser = /(const|let)\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*await req\.json/.test(content);
      const verifies = /resolveCaller|requireUser|getUser\(req\)|requireCron/.test(content);
      if (usesBodyUser && !verifies) {
        offenders.push(`${file}: confia em userId do corpo sem verificar sessão`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("funções expostas exigem sessão verificada ou segredo de cron", () => {
    const offenders: string[] = [];
    for (const file of FUNCTION_FILES) {
      if (SKIP.some((s) => file.includes(s))) continue;
      const content = read(file);
      if (!content.includes("Deno.serve")) continue;
      const guarded = /resolveCaller|requireUser|requireCaller|requireCron|requireTelegramSecret/.test(content);
      if (!guarded) offenders.push(file);
    }
    expect(offenders, "edge function sem verificação de identidade").toEqual([]);
  });

  it("cache de IA com dados de carteira é escopado por conta", () => {
    const offenders: string[] = [];
    for (const file of FUNCTION_FILES) {
      const content = read(file);
      if (!content.includes("withAICache(")) continue;
      if (file.includes("ai-cache-helper")) continue;
      if (!content.includes("userId")) offenders.push(file);
    }
    expect(offenders, "withAICache sem userId (reuso entre contas)").toEqual([]);
  });
});

describe("isolamento — políticas de banco", () => {
  const policyLines = MIGRATIONS.flatMap((f) =>
    read(f)
      .split(";")
      .filter((stmt) => /CREATE\s+POLICY/i.test(stmt))
      .map((stmt) => ({ file: f, stmt: stmt.replace(/\s+/g, " ").trim() })),
  );

  it("nenhuma policy de leitura para usuários logados usa condição sempre verdadeira", () => {
    const offenders = policyLines.filter(({ stmt }) => {
      const isRead = /FOR\s+(SELECT|ALL)/i.test(stmt);
      const toAuthenticated = /TO\s+authenticated/i.test(stmt) || !/TO\s+service_role/i.test(stmt);
      const alwaysTrue = /USING\s*\(\s*true\s*\)/i.test(stmt);
      return isRead && toAuthenticated && alwaysTrue;
    });

    // A correção do ai_cache removeu a última ocorrência; qualquer nova quebra o teste.
    const active = offenders.filter(({ stmt }) => !/service_role/i.test(stmt));
    expect(active.map((o) => `${o.file}: ${o.stmt.slice(0, 120)}`)).toEqual([]);
  });

  it("nenhuma rota administrativa lê o bot_token do Telegram", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const content = read(file);
      // Leitura da tabela sem filtro por user_id = leitura de outras contas.
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("from('telegram_settings')") && !line.includes('from("telegram_settings")')) return;
        const window = lines.slice(i, i + 3).join(" ");
        if (!/eq\(\s*['"]user_id['"]/.test(window)) {
          offenders.push(`${file}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(offenders, "leitura ampla de telegram_settings no cliente").toEqual([]);
  });
});
