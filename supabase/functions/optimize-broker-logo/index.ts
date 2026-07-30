// Optimize a broker logo server-side: decode, resize to a hard cap and
// re-encode as WebP/PNG to minimize bytes. Returns a versioned data URL so
// clients can invalidate caches deterministically.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { Image, decode } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { requireCaller } from "../_shared/auth.ts";

const MAX_DIM = 128;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error('invalid data url');
  const mime = m[1].toLowerCase();
  const isB64 = Boolean(m[2]);
  const payload = m[3];
  if (!isB64) {
    // percent-encoded (SVG usually)
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mime };
  }
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Somente sessão válida (ou chamada interna cron/service): evita uso do endpoint
  // como proxy gratuito de LLM e vazamento de dados entre contas.
  const denied = await requireCaller(req);
  if (denied) return denied;

  try {
    const { dataUrl } = await req.json();
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return new Response(JSON.stringify({ error: 'dataUrl required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (dataUrl.length > MAX_INPUT_BYTES * 1.4) {
      return new Response(JSON.stringify({ error: 'payload too large' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { bytes: inputBytes, mime } = dataUrlToBytes(dataUrl);

    // SVG: já é vetorial, apenas normaliza + versiona
    if (mime === 'image/svg+xml') {
      const version = await sha256Hex(inputBytes);
      return new Response(JSON.stringify({
        dataUrl,
        format: 'image/svg+xml',
        width: MAX_DIM, height: MAX_DIM,
        size_bytes: inputBytes.byteLength,
        version,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const img = await decode(inputBytes) as Image;
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    if (scale < 1) img.resize(w, h);

    // Encode as PNG (imagescript não faz WebP) — perda mínima e universal.
    const encoded = await img.encode(1); // fastest compression 0-3; 1 = boa relação
    const version = await sha256Hex(encoded);
    const outMime = 'image/png';
    const outDataUrl = toDataUrl(encoded, outMime);

    return new Response(JSON.stringify({
      dataUrl: outDataUrl,
      format: outMime,
      width: img.width, height: img.height,
      size_bytes: encoded.byteLength,
      version,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
