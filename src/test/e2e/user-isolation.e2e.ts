/**
 * E2E — Isolamento de usuário
 *
 * Roda com Playwright fora do Vitest (não incluído no `include` do vitest.config).
 * Uso local:
 *   TEST_USER_A=... TEST_PASS_A=... TEST_USER_B=... TEST_PASS_B=... \
 *     bun x playwright test src/test/e2e/user-isolation.e2e.ts
 *
 * Verifica que ao alternar/sair de contas na MESMA aba:
 *   1. IndexedDB (persistent cache) é limpo.
 *   2. localStorage per-user (dashboard_bootstrap*, portfolio_*, ai-*, alerts:*)
 *      não sobrevive à troca.
 *   3. UI não mostra holdings do usuário anterior antes do reload.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

const USER_A = { email: process.env.TEST_USER_A!, pass: process.env.TEST_PASS_A! };
const USER_B = { email: process.env.TEST_USER_B!, pass: process.env.TEST_PASS_B! };

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/auth`);
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(pass);
  await page.getByRole('button', { name: /entrar|login/i }).click();
  await page.waitForURL(/\/$|\/dashboard/, { timeout: 15_000 });
}

async function dumpUserScopedStorage(page: Page) {
  return page.evaluate(() => {
    const ls: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (/^(dashboard_bootstrap|portfolio_|ai-|alerts:|onboarding_|user_)/.test(k)) {
        ls[k] = localStorage.getItem(k) ?? '';
      }
    }
    // rough IndexedDB entry count
    return new Promise<{ ls: Record<string, string>; idbKeys: string[] }>((resolve) => {
      const req = indexedDB.open('simplynvest-cache');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) return resolve({ ls, idbKeys: [] });
        const tx = db.transaction('kv', 'readonly').objectStore('kv').getAllKeys();
        tx.onsuccess = () => resolve({ ls, idbKeys: (tx.result as string[]) ?? [] });
        tx.onerror = () => resolve({ ls, idbKeys: [] });
      };
      req.onerror = () => resolve({ ls, idbKeys: [] });
    });
  });
}

test.describe('data isolation between accounts', () => {
  test.skip(!USER_A.email || !USER_B.email, 'set TEST_USER_A/B env vars');

  test('logout purges all per-user caches', async ({ page }) => {
    await login(page, USER_A.email, USER_A.pass);
    // Trigger dashboard load so caches populate
    await page.waitForSelector('text=/Patrimônio Total|Carteira de Ativos/i', { timeout: 20_000 });
    const before = await dumpUserScopedStorage(page);
    expect(Object.keys(before.ls).length + before.idbKeys.length).toBeGreaterThan(0);

    // Sign out via UI
    await page.getByRole('button', { name: /sair|logout/i }).click();
    await page.waitForURL(/\/auth/, { timeout: 10_000 });

    const after = await dumpUserScopedStorage(page);
    expect(after.ls, 'per-user localStorage keys must be gone').toEqual({});
    expect(after.idbKeys, 'IndexedDB user cache must be gone').toEqual([]);
  });

  test('switching accounts in the same tab does not leak holdings', async ({ page }) => {
    await login(page, USER_A.email, USER_A.pass);
    await page.waitForSelector('text=/Patrimônio Total/i');
    const aHtml = await page.locator('body').innerText();

    await page.getByRole('button', { name: /sair|logout/i }).click();
    await page.waitForURL(/\/auth/);

    await login(page, USER_B.email, USER_B.pass);
    // After UID change useAuth forces a reload; wait for fresh render
    await page.waitForSelector('text=/Patrimônio Total/i', { timeout: 20_000 });

    // No ticker from user A should appear on user B's dashboard.
    // (extract A's tickers heuristically: 3-6 uppercase letter tokens)
    const tickersA = [...aHtml.matchAll(/\b[A-Z]{3,6}\d?\b/g)]
      .map((m) => m[0])
      .filter((t) => !['BRL', 'USD', 'EUR', 'FII', 'ETF', 'BDR', 'ROI'].includes(t));
    const bHtml = await page.locator('body').innerText();
    for (const t of new Set(tickersA)) {
      expect(bHtml, `user B must not see ticker ${t} from user A`).not.toContain(t);
    }
  });
});
