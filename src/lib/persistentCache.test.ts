/**
 * Isolamento do cache persistente (IndexedDB) entre contas.
 *
 * Regressões que estes testes travam:
 *  - chave de cache sem o id do usuário (conta B lendo análise da conta A);
 *  - entrada gravada por um usuário sendo servida a outro após troca de conta
 *    quando a limpeza de logout falha.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  getCached,
  setCache,
  clearCache,
  userScopedKey,
  CACHE_TTL,
} from "./persistentCache";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("persistentCache — isolamento por conta", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("gera chaves diferentes para usuários diferentes com o mesmo conteúdo", () => {
    const a = userScopedKey(USER_A, "ai-insights:PETR4,VALE3");
    const b = userScopedKey(USER_B, "ai-insights:PETR4,VALE3");
    expect(a).not.toBe(b);
    expect(a).toContain(USER_A);
    expect(b).toContain(USER_B);
  });

  it("não devolve ao usuário B uma entrada gravada pelo usuário A", async () => {
    const key = userScopedKey(USER_A, "ai-insights:PETR4");
    await setCache(key, { summary: "carteira do usuário A" }, CACHE_TTL.AI_RESPONSE, {
      owner: USER_A,
    });

    // Mesmo forçando a chave exata da conta A, o dono não bate.
    expect(await getCached(key, { owner: USER_B })).toBeNull();
    // E a chave própria da conta B nem existe.
    expect(
      await getCached(userScopedKey(USER_B, "ai-insights:PETR4"), { owner: USER_B }),
    ).toBeNull();
  });

  it("devolve a entrada apenas para o dono", async () => {
    const key = userScopedKey(USER_A, "dashboard_bootstrap");
    await setCache(key, { total: 1234 }, CACHE_TTL.SNAPSHOTS, { owner: USER_A });
    expect(await getCached(key, { owner: USER_A })).toEqual({ total: 1234 });
  });

  it("rejeita leitura anônima de entrada com dono", async () => {
    const key = userScopedKey(USER_A, "ai-advisor:PETR4:o que comprar?");
    await setCache(key, "resposta privada", CACHE_TTL.AI_RESPONSE, { owner: USER_A });
    expect(await getCached(key)).toBeNull();
  });

  it("mantém dados públicos (cotações/câmbio) compartilhados", async () => {
    await setCache("fx:usd_eur_brl", { USD: 5.4, EUR: 6.1 }, CACHE_TTL.RATES);
    expect(await getCached("fx:usd_eur_brl")).toEqual({ USD: 5.4, EUR: 6.1 });
    // Continua indisponível como se fosse dado de um usuário específico.
    expect(await getCached("fx:usd_eur_brl", { owner: USER_A })).toBeNull();
  });

  it("expira entradas vencidas", async () => {
    const key = userScopedKey(USER_A, "expira");
    await setCache(key, "x", -1, { owner: USER_A });
    expect(await getCached(key, { owner: USER_A })).toBeNull();
  });

  it("clearCache remove tudo no logout", async () => {
    await setCache(userScopedKey(USER_A, "k1"), 1, 60_000, { owner: USER_A });
    await setCache(userScopedKey(USER_B, "k1"), 2, 60_000, { owner: USER_B });
    await clearCache();
    expect(await getCached(userScopedKey(USER_A, "k1"), { owner: USER_A })).toBeNull();
    expect(await getCached(userScopedKey(USER_B, "k1"), { owner: USER_B })).toBeNull();
  });
});
