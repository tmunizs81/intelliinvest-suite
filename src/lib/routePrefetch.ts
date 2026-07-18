/**
 * Route prefetch map — matches sidebar routes to lazy imports.
 * On hover, we trigger the dynamic import to preload the chunk.
 */
const prefetchMap: Record<string, () => Promise<any>> = {
  '/': () => import('../pages/Index'),
  '/ai-trader': () => import('../pages/AITrader'),
  '/dividends': () => import('../pages/Dividends'),
  '/taxes': () => import('../pages/Taxes'),
  '/assets': () => import('../pages/Assets'),
  '/reports': () => import('../pages/Reports'),
  '/analysis': () => import('../pages/Analysis'),
  '/comparator': () => import('../pages/Comparator'),
  '/family': () => import('../pages/FamilyPortfolio'),
  '/settings': () => import('../pages/SettingsPage'),
  '/manual': () => import('../pages/Manual'),
};

const prefetched = new Set<string>();

export function prefetchRoute(path: string) {
  if (prefetched.has(path)) return;
  const loader = prefetchMap[path];
  if (loader) {
    prefetched.add(path);
    // Use requestIdleCallback for non-blocking prefetch
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => loader());
    } else {
      setTimeout(loader, 100);
    }
  }
}
