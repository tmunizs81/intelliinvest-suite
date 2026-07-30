/**
 * Tracing distribuído compatível com OpenTelemetry para Edge Functions.
 *
 * Por que não o SDK oficial: o SDK Node/Deno do OTel puxa dezenas de módulos e
 * arruína o cold-start de funções que precisam responder em <300ms. Aqui
 * implementamos o essencial do padrão:
 *
 *  - Contexto W3C Trace Context (`traceparent` / `tracestate`) propagado entre
 *    rota HTTP → cache → worker → chamada de IA.
 *  - Spans com trace_id/span_id/parent_span_id de 16 e 8 bytes hex.
 *  - Atributos com convenções semânticas OTel (`http.*`, `cache.*`, `gen_ai.*`,
 *    `messaging.*`, `peer.service`).
 *  - Exportação dupla: sempre persiste em `public.trace_spans` (consulta no
 *    painel) e, se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver configurado, envia
 *    OTLP/HTTP JSON para um coletor externo (Tempo, Jaeger, Grafana Cloud...).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SERVICE_NAME = Deno.env.get("OTEL_SERVICE_NAME") ?? "simplynvest-edge";
const OTLP_ENDPOINT = Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT") ?? "";
const OTLP_HEADERS = Deno.env.get("OTEL_EXPORTER_OTLP_HEADERS") ?? "";

let client: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!client) {
    client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}

export type SpanKind = "SERVER" | "CLIENT" | "INTERNAL" | "PRODUCER" | "CONSUMER";
export type SpanStatus = "UNSET" | "OK" | "ERROR";

export interface SpanContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

interface RecordedSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: SpanKind;
  service_name: string;
  user_id: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status_code: SpanStatus;
  error_message: string | null;
  attributes: Record<string, unknown>;
}

function hex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lê o cabeçalho `traceparent` (W3C) ou cria um contexto raiz. */
export function extractContext(req: Request): SpanContext {
  const header = req.headers.get("traceparent") ?? "";
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim());
  if (m) {
    return { traceId: m[1], spanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 };
  }
  return { traceId: hex(16), spanId: hex(8), sampled: true };
}

export function toTraceparent(ctx: SpanContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? "01" : "00"}`;
}

/** Cabeçalhos para propagar o trace em chamadas internas (fetch → outra função). */
export function injectHeaders(
  span: Span,
  base: Record<string, string> = {},
): Record<string, string> {
  return { ...base, traceparent: toTraceparent(span.context) };
}

export class Tracer {
  readonly root: Span;
  private spans: RecordedSpan[] = [];

  constructor(
    private readonly rootName: string,
    private readonly parent: SpanContext,
    private readonly userId: string | null,
    attributes: Record<string, unknown> = {},
  ) {
    this.root = new Span(this, rootName, "SERVER", parent.traceId, parent.spanId, attributes);
  }

  get traceId() { return this.parent.traceId; }
  get user() { return this.userId; }

  _push(span: RecordedSpan) { this.spans.push(span); }

  /** Envia os spans acumulados. Nunca lança e nunca bloqueia a resposta. */
  flush(): void {
    if (this.spans.length === 0) return;
    const batch = this.spans;
    this.spans = [];

    admin()
      .from("trace_spans")
      .insert(batch)
      .then(({ error }) => { if (error) console.warn("[otel] persist:", error.message); });

    if (OTLP_ENDPOINT) void exportOtlp(batch);
  }
}

export class Span {
  readonly context: SpanContext;
  private readonly startedAt = new Date();
  private readonly t0 = performance.now();
  private status: SpanStatus = "UNSET";
  private error: string | null = null;
  private ended = false;

  constructor(
    private readonly tracer: Tracer,
    private readonly name: string,
    private readonly kind: SpanKind,
    traceId: string,
    private readonly parentSpanId: string | null,
    private attributes: Record<string, unknown> = {},
  ) {
    this.context = { traceId, spanId: hex(8), sampled: true };
  }

  /** Cria um span filho (cache, chamada externa, IA, job...). */
  child(name: string, kind: SpanKind = "INTERNAL", attributes: Record<string, unknown> = {}): Span {
    return new Span(this.tracer, name, kind, this.context.traceId, this.context.spanId, attributes);
  }

  setAttributes(attrs: Record<string, unknown>): this {
    this.attributes = { ...this.attributes, ...attrs };
    return this;
  }

  setError(e: unknown): this {
    this.status = "ERROR";
    this.error = e instanceof Error ? e.message : String(e);
    return this;
  }

  end(status: SpanStatus = this.status === "ERROR" ? "ERROR" : "OK"): void {
    if (this.ended) return;
    this.ended = true;
    const endedAt = new Date();
    this.tracer._push({
      trace_id: this.context.traceId,
      span_id: this.context.spanId,
      parent_span_id: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      service_name: SERVICE_NAME,
      user_id: this.tracer.user,
      started_at: this.startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: Math.round(performance.now() - this.t0),
      status_code: status,
      error_message: this.error,
      attributes: this.attributes,
    });
  }

  /** Açúcar: executa `fn` dentro de um span filho já finalizado corretamente. */
  async trace<T>(
    name: string,
    kind: SpanKind,
    attributes: Record<string, unknown>,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    const span = this.child(name, kind, attributes);
    try {
      const out = await fn(span);
      span.end("OK");
      return out;
    } catch (e) {
      span.setError(e).end("ERROR");
      throw e;
    }
  }
}

/**
 * Ponto de entrada de uma rota: cria o tracer raiz já com atributos HTTP.
 *
 *   const tracer = startRequestTrace(req, "yahoo-finance-history", userId);
 *   ... tracer.root.trace("cache.lookup", "INTERNAL", {...}, fn)
 *   tracer.root.setAttributes({ "http.status_code": 200 });
 *   tracer.root.end("OK"); tracer.flush();
 */
export function startRequestTrace(
  req: Request,
  routeName: string,
  userId: string | null = null,
  extra: Record<string, unknown> = {},
): Tracer {
  const ctx = extractContext(req);
  const url = new URL(req.url);
  return new Tracer(routeName, ctx, userId, {
    "http.request.method": req.method,
    "http.route": routeName,
    "url.path": url.pathname,
    "server.address": url.host,
    ...extra,
  });
}

/** Converte atributos JS para o formato OTLP anyValue. */
function otlpAttrs(attrs: Record<string, unknown>) {
  return Object.entries(attrs).map(([key, v]) => ({
    key,
    value:
      typeof v === "number" ? (Number.isInteger(v) ? { intValue: v } : { doubleValue: v })
      : typeof v === "boolean" ? { boolValue: v }
      : { stringValue: v === null || v === undefined ? "" : String(v) },
  }));
}

async function exportOtlp(batch: RecordedSpan[]): Promise<void> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    for (const pair of OTLP_HEADERS.split(",")) {
      const [k, ...rest] = pair.split("=");
      if (k && rest.length) headers[k.trim()] = rest.join("=").trim();
    }

    const payload = {
      resourceSpans: [{
        resource: { attributes: otlpAttrs({ "service.name": SERVICE_NAME, "deployment.environment": "production" }) },
        scopeSpans: [{
          scope: { name: "simplynvest/edge", version: "1.0.0" },
          spans: batch.map((s) => ({
            traceId: s.trace_id,
            spanId: s.span_id,
            parentSpanId: s.parent_span_id ?? undefined,
            name: s.name,
            kind: { INTERNAL: 1, SERVER: 2, CLIENT: 3, PRODUCER: 4, CONSUMER: 5 }[s.kind] ?? 1,
            startTimeUnixNano: `${new Date(s.started_at).getTime()}000000`,
            endTimeUnixNano: `${new Date(s.ended_at).getTime()}000000`,
            attributes: otlpAttrs(s.attributes),
            status: { code: s.status_code === "ERROR" ? 2 : s.status_code === "OK" ? 1 : 0, message: s.error_message ?? undefined },
          })),
        }],
      }],
    };

    await fetch(`${OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn("[otel] OTLP export falhou:", (e as Error).message);
  }
}
