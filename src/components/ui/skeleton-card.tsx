import { motion } from 'framer-motion';

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`rounded-lg border border-border bg-card p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        <div className="h-4 w-4 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-6 w-28 rounded bg-muted animate-pulse mb-2" />
      <div className="h-3 w-16 rounded bg-muted animate-pulse" />
    </motion.div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 border-b border-border last:border-0">
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
      </div>
      <div className="text-right space-y-1.5">
        <div className="h-3.5 w-20 rounded bg-muted animate-pulse ml-auto" />
        <div className="h-2.5 w-14 rounded bg-muted animate-pulse ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonChart({ height = 'h-48' }: { height?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`rounded-lg border border-border bg-card p-4 ${height}`}
    >
      <div className="h-3 w-32 rounded bg-muted animate-pulse mb-4" />
      <div className="flex items-end gap-1 h-[calc(100%-2rem)]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-muted animate-pulse"
            style={{ height: `${30 + Math.random() * 60}%`, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </motion.div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <SkeletonChart height="h-64" />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
