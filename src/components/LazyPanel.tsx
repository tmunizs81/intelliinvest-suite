import { useRef, useState, useEffect, type ReactNode } from 'react';

interface LazyPanelProps {
  children: ReactNode;
  /** Height placeholder before render */
  minHeight?: number;
  /** Root margin for early trigger */
  rootMargin?: string;
  className?: string;
}

/**
 * Renders children only when the container enters the viewport.
 * Uses IntersectionObserver for zero-cost offscreen panels.
 */
export default function LazyPanel({
  children,
  minHeight = 200,
  rootMargin = '200px',
  className = '',
}: LazyPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  if (visible) return <>{children}</>;

  return (
    <div
      ref={ref}
      className={`animate-pulse bg-muted/30 rounded-xl ${className}`}
      style={{ minHeight }}
    />
  );
}
