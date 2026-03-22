/**
 * Shimmer skeleton that mimics AI panel layout (header + content lines).
 */
export function AISkeletonPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-pulse">
      {/* Header skeleton */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-muted" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-28 bg-muted rounded" />
          <div className="h-2.5 w-40 bg-muted/60 rounded" />
        </div>
        <div className="h-7 w-7 rounded-lg bg-muted" />
      </div>
      {/* Content skeleton */}
      <div className="p-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-muted rounded" style={{ width: `${85 - i * 10}%` }} />
            <div className="h-2.5 bg-muted/50 rounded" style={{ width: `${70 - i * 5}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AIScoreSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-pulse">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-muted" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 bg-muted rounded" />
          <div className="h-2.5 w-44 bg-muted/60 rounded" />
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 text-center space-y-2">
            <div className="h-2.5 w-16 bg-muted rounded mx-auto" />
            <div className="h-8 w-12 bg-muted rounded mx-auto" />
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center space-y-2">
            <div className="h-2.5 w-16 bg-muted rounded mx-auto" />
            <div className="h-8 w-12 bg-muted rounded mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
