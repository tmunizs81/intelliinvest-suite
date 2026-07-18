export default function VersionFooter() {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const buildDate = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';
  const formatted = buildDate
    ? new Date(buildDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  return (
    <footer className="mt-8 py-4 px-4 text-center text-[11px] text-muted-foreground/70 border-t border-border/40">
      <span className="font-mono">
        T2-Simplynvest · v{version}
        {formatted && <> · build {formatted}</>}
      </span>
    </footer>
  );
}
