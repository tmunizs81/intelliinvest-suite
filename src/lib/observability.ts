import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = import.meta.env.MODE;
let initialized = false;

export function initObservability() {
  if (initialized || !DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    tracesSampleRate: ENV === "production" ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: ENV === "production" ? 0.1 : 0,
    beforeSend(event) {
      // Never leak Supabase/DeepSeek keys or auth tokens
      const s = JSON.stringify(event);
      if (/eyJ[A-Za-z0-9_-]{20,}\./.test(s) || /sk-[A-Za-z0-9]{20,}/.test(s)) {
        return null;
      }
      return event;
    },
  });
  initialized = true;
}

export function identifyUser(user: { id: string; email?: string } | null) {
  if (!DSN) return;
  if (user) Sentry.setUser({ id: user.id, email: user.email });
  else Sentry.setUser(null);
}

export function captureError(err: unknown, ctx?: Record<string, unknown>) {
  if (DSN) {
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
  } else {
    // eslint-disable-next-line no-console
    console.error("[obs]", err, ctx);
  }
}

export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info") {
  if (DSN) Sentry.captureMessage(msg, level);
  else console.log(`[obs:${level}]`, msg);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
