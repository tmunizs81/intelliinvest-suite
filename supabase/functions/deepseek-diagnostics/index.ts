import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('DEEPSEEK_API_KEY');
  const result: Record<string, unknown> = {
    provider: 'deepseek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    key_configured: !!key,
    key_prefix: key ? `${key.slice(0, 6)}…` : null,
    timestamp: new Date().toISOString(),
  };

  if (!key) {
    return new Response(JSON.stringify({ ...result, status: 'missing_key', ok: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const t0 = performance.now();
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    const latency = Math.round(performance.now() - t0);
    const bodyText = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }

    return new Response(JSON.stringify({
      ...result,
      ok: resp.ok,
      status: resp.ok ? 'healthy' : 'error',
      http_status: resp.status,
      latency_ms: latency,
      model: parsed?.model ?? 'deepseek-chat',
      error: resp.ok ? null : (parsed?.error?.message ?? bodyText.slice(0, 300)),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({
      ...result,
      ok: false,
      status: 'network_error',
      latency_ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
