/**
 * Invariantes de multi-tenancy verificadas por varredura do código-fonte.
 *
 * Objetivo: qualquer PR que reintroduza uma das falhas abaixo quebra o CI,
 * mesmo sem banco de dados disponível no runner:
 *
 *  1. Cache de navegador com dados pessoais precisa ser escopado por conta.
 *  2. Chamadas a Edge Functions não podem usar a publishable key como bearer
 *     (isso derruba a identidade do chamador e o rate limit por usuário).
 *  3. Edge Functions expostas precisam verificar a identidade do chamador.
 *  4. Nenhuma policy ativa pode liberar leitura com condição sempre verdadeira.
 *  5. O bot_token do Telegram não pode ser lido por rotas administrativas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

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

const read = (f: string) => readFileSync(f, "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SRC_FILES = walk("src", [".ts", ".tsx"]).filter((f) => !f.includes(".test."));
const FUNCTION_FILES = walk("supabase/functions", [".ts"]).filter(
  (f) => !f.includes("_test") && !f.includes(".test."),
);
const MIGRATIONS = walk("supabase/migrations", [".sql"]).sort();

/** Chaves de cache derivadas de dados da carteira do usuário. */
const PERSONAL_CACHE = /(ai-insights|ai-advisor|dashboard_bootstrap|portfolio_metrics)/;

describe("isolamento — cache do navegador", () => {
  it("toda leitura de cache pessoal valida o dono da entrada", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      for (const line of read(file).split("\n")) {
        if (!/getCached\s*[<(]/.test(line)) continue;
        const isPersonal = PERSONAL_CACHE.test(line) || line.includes("userScopedKey");
        if (isPersonal && !line.includes("owner")) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, "cache pessoal lido sem validar o dono").toEqual([]);
  });

  it("toda escrita de cache pessoal marca o dono da entrada", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      for (const line of read(file).split("\n")) {
        if (!/setCache\s*\(/.test(line)) continue;
        const isPersonal = PERSONAL_CACHE.test(line) || /cacheKey/.test(line);
        if (isPersonal && !line.includes("owner")) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, "cache pessoal gravado sem dono").toEqual([]);
  });

  it("chaves de IA e dashboard passam por userScopedKey", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      for (const line of read(file).split("\n")) {
        if (!/cacheKey\s*=/.test(line)) continue;
        if (PERSONAL_CACHE.test(line) && !line.includes("userScopedKey")) {
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

  it("fetch direto a /functions/v1 envia o access_token da sessão", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const content = read(file);
      if (!content.includes("/functions/v1") || !content.includes("fetch(")) continue;
      if (!content.includes("access_token")) offenders.push(file);
    }
    expect(offenders, "fetch a edge function sem token de sessão").toEqual([]);
  });
});

describe("isolamento — Edge Functions", () => {
  /** Endpoints públicos por desenho (não retornam dado de usuário). */
  const PUBLIC_BY_DESIGN = new Set(["health-check"]);

  const GUARDS =
    /resolveCaller|requireUser|requireCaller|requireCron|TelegramSecret|secret-token|auth\.getUser\(|auth\.getClaims\(|getUser\(req|getUser\(authedReq/i;

  const entrypoints = FUNCTION_FILES.filter(
    (f) => basename(f) === "index.ts" && read(f).includes("Deno.serve"),
  );

  it("existe pelo menos um entrypoint para analisar", () => {
    expect(entrypoints.length).toBeGreaterThan(10);
  });

  it("nenhuma função deriva identidade de atob(jwt)", () => {
    const offenders = FUNCTION_FILES.filter((f) =>
      /atob\(\s*(token|jwt|authHeader|auth)/.test(stripComments(read(f))),
    );
    expect(offenders, "JWT decodificado manualmente (forjável)").toEqual([]);
  });

  it("todo endpoint exposto verifica a identidade do chamador", () => {
    const offenders = entrypoints.filter((f) => {
      const name = f.split("/").at(-2)!;
      if (PUBLIC_BY_DESIGN.has(name)) return false;
      return !GUARDS.test(stripComments(read(f)));
    });
    expect(offenders, "edge function sem verificação de identidade").toEqual([]);
  });

  it("nenhuma função confia em userId vindo do corpo sem verificar sessão", () => {
    const offenders = FUNCTION_FILES.filter((f) => {
      const content = stripComments(read(f));
      const bodyUser =
        /(const|let)\s*\{[^}]*\b(userId|user_id)\b[^}]*\}\s*=\s*(await\s*)?req\.json/.test(content);
      return bodyUser && !GUARDS.test(content);
    });
    expect(offenders).toEqual([]);
  });

  it("cache de IA com dados de carteira é escopado por conta", () => {
    const offenders = FUNCTION_FILES.filter(
      (f) =>
        read(f).includes("withAICache(") &&
        !f.includes("ai-cache-helper") &&
        !read(f).includes("userId"),
    );
    expect(offenders, "withAICache sem userId (reuso entre contas)").toEqual([]);
  });
});

describe("isolamento — políticas de banco", () => {
  /** Reconstrói o estado final das policies aplicando as migrações em ordem. */
  function effectivePolicies() {
    const active = new Map<string, string>();
    for (const file of MIGRATIONS) {
      const sql = read(file);
      for (const raw of sql.split(";")) {
        const stmt = raw.replace(/\s+/g, " ").trim();
        const created = stmt.match(/CREATE\s+POLICY\s+"?([^"]+?)"?\s+ON\s+([\w.]+)/i);
        const dropped = stmt.match(/DROP\s+POLICY\s+(IF\s+EXISTS\s+)?"?([^"]+?)"?\s+ON\s+([\w.]+)/i);
        if (dropped) active.delete(`${dropped[3]}|${dropped[2]}`);
        if (created) active.set(`${created[2]}|${created[1]}`, `${file} :: ${stmt}`);
      }
    }
    return [...active.values()];
  }

  it("nenhuma policy ativa libera leitura ampla para usuários logados", () => {
    const offenders = effectivePolicies().filter((entry) => {
      const stmt = entry.split(" :: ")[1];
      const isRead = /FOR\s+(SELECT|ALL)/i.test(stmt);
      const serviceOnly = /TO\s+service_role/i.test(stmt) && !/authenticated|anon/i.test(stmt);
      const alwaysTrue = /USING\s*\(\s*true\s*\)/i.test(stmt);
      return isRead && alwaysTrue && !serviceOnly;
    });

    // Catálogos públicos (dados de mercado, sem PII) podem permanecer abertos.
    const PUBLIC_CATALOGS = /ondo_gm_tokens/;
    const sensitive = offenders.filter((o) => !PUBLIC_CATALOGS.test(o));
    expect(sensitive.map((o) => o.slice(0, 160))).toEqual([]);
  });

  it("o cache de IA não é legível por usuários logados", () => {
    const aiCache = effectivePolicies().filter((e) => /ON\s+public\.ai_cache/i.test(e));
    const readableByUsers = aiCache.filter((e) => /TO\s+(anon|authenticated)/i.test(e));
    expect(readableByUsers).toEqual([]);
  });

  it("nenhuma leitura ampla de telegram_settings no cliente", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const lines = read(file).split("\n");
      lines.forEach((line, i) => {
        if (!/from\(['"]telegram_settings['"]\)/.test(line)) return;
        const window = lines.slice(i, i + 3).join(" ");
        // Só leituras importam; escritas já são barradas pelo RLS (WITH CHECK).
        if (!/\.select\(/.test(window)) return;
        if (!/eq\(\s*['"]user_id['"]/.test(window)) offenders.push(`${file}:${i + 1} ${line.trim()}`);
      });
    }
    expect(offenders, "leitura de telegram_settings sem filtro por usuário").toEqual([]);
  });

  it("o painel admin usa a visão sem bot_token", () => {
    const settings = read("src/pages/SettingsPage.tsx");
    expect(settings).toContain("admin_list_telegram_overview");
  });
});

describe("isolamento — segredo do Telegram nunca chega ao cliente", () => {
  it("nenhum componente lê ou guarda bot_token vindo do banco", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      if (file.endsWith("integrations/supabase/types.ts")) continue;
      for (const line of read(file).split("\n")) {
        const reads =
          /(data|settings|row|t)\.bot_token/.test(line) ||
          /bot_token\s*:\s*(data|settings|local|s)\./.test(line);
        if (reads) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, "bot_token lido/propagado no cliente").toEqual([]);
  });

  it("o token nunca é persistido em localStorage ou cache", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      for (const line of read(file).split("\n")) {
        if (/(localStorage|sessionStorage|setCache)[^\n]*bot_?[Tt]oken/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "token persistido no navegador").toEqual([]);
  });

  it("as leituras de telegram_settings usam a RPC auditada", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const content = read(file);
      if (/from\(['"]telegram_settings['"]\)[\s\S]{0,80}\.select\(/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders, "leitura direta da tabela em vez de get_my_telegram_settings").toEqual([]);
  });

  it("o cache do navegador usa esquema versionado (rotação de chaves)", () => {
    const cache = read("src/lib/persistentCache.ts");
    expect(cache).toContain("export const CACHE_SCHEMA");
    expect(cache).toContain("rotateCacheSchema");
    expect(read("src/hooks/useAuth.tsx")).toContain("rotateCacheSchema");
  });
});
