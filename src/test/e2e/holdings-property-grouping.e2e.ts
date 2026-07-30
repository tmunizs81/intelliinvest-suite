/**
 * E2E — Regra de agrupamento de imóveis (`agg.key`)
 *
 * Uso:
 *   TEST_USER=... TEST_PASS=... bun x playwright test src/test/e2e/holdings-property-grouping.e2e.ts
 *
 * Garante que em /assets:
 *   1. Cada imóvel é uma linha própria (uma `data-agg-key` distinta por posição),
 *      mesmo quando vários compartilham o mesmo ticker.
 *   2. Nenhuma linha de imóvel exibe o selo "N corretoras" (sinal de fusão indevida).
 *   3. Ativos financeiros continuam unificados por ticker.
 *   4. Ordenação (Valor, Lucro, Alocação, PM) preserva as linhas e persiste entre visitas,
 *      inclusive no layout mobile.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const USER = { email: process.env.TEST_USER!, pass: process.env.TEST_PASS! };

async function login(page: Page) {
  await page.goto(`${BASE}/auth`);
  await page.getByLabel(/e-?mail/i).fill(USER.email);
  await page.getByLabel(/senha/i).fill(USER.pass);
  await page.getByRole('button', { name: /entrar|login/i }).click();
  await page.waitForURL(/\/$|\/dashboard/, { timeout: 15_000 });
}

async function gotoAssets(page: Page) {
  await page.goto(`${BASE}/assets`);
  await page.locator('[data-holdings-root]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

/** Chaves de agrupamento renderizadas (desktop e mobile usam o mesmo atributo). */
async function aggKeys(page: Page): Promise<string[]> {
  return page.$$eval('[data-agg-key]', (els) =>
    els.map((e) => e.getAttribute('data-agg-key') ?? '').filter(Boolean),
  );
}

test.describe('agrupamento de holdings', () => {
  test('imóveis com mesmo ticker aparecem em linhas separadas', async ({ page }) => {
    await login(page);
    await gotoAssets(page);

    const keys = await aggKeys(page);
    expect(keys.length).toBeGreaterThan(0);

    const propertyKeys = keys.filter((k) => k.startsWith('IMOVEL'));
    test.skip(propertyKeys.length === 0, 'Conta de teste sem imóveis cadastrados');

    // Toda chave de imóvel é única e carrega o sufixo da posição (ticker::id)
    expect(new Set(propertyKeys).size).toBe(propertyKeys.length);
    propertyKeys.forEach((k) => expect(k).toContain('::'));

    // Nenhuma linha de imóvel pode indicar múltiplas corretoras fundidas
    const merged = await page.$$eval('[data-agg-key^="IMOVEL"]', (els) =>
      els.filter((e) => /\d+\s+corretoras/i.test(e.textContent ?? '')).length,
    );
    expect(merged).toBe(0);
  });

  test('ativos financeiros permanecem unificados por ticker', async ({ page }) => {
    await login(page);
    await gotoAssets(page);

    const financialKeys = (await aggKeys(page)).filter((k) => !k.startsWith('IMOVEL'));
    financialKeys.forEach((k) => expect(k).not.toContain('::'));
    expect(new Set(financialKeys).size).toBe(financialKeys.length);
  });

  test('ordenação mobile preserva imóveis separados e persiste entre visitas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await gotoAssets(page);

    const before = await aggKeys(page);

    for (const label of ['Valor', 'Lucro', 'Alocação', 'Preço médio']) {
      await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
      await page.waitForTimeout(250);
      const after = await aggKeys(page);
      expect(new Set(after)).toEqual(new Set(before));
      expect(new Set(after).size).toBe(after.length);
    }

    const persisted = await page.evaluate(() => localStorage.getItem('assets:sort:v1'));
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted!).key).toBe('avgPrice');

    const orderBeforeReload = await aggKeys(page);
    await page.reload();
    await page.locator('[data-holdings-root]').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    expect(await aggKeys(page)).toEqual(orderBeforeReload);
  });
});
