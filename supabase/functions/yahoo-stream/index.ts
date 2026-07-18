/**
 * yahoo-stream — WebSocket relay para o streamer do Yahoo Finance.
 *
 * Cliente conecta via WS, envia { subscribe: ["AAPL","PETR4.SA",...] }
 * e recebe JSON { id, price, changePercent, time } em tempo real.
 *
 * Substitui o polling de 5 min do LiveTickerBar.
 */

// Decoder mínimo do protobuf PricingData do Yahoo.
// Só precisamos dos campos usados no ticker.
function decodePricingData(bytes: Uint8Array) {
  const out: { id?: string; price?: number; time?: number; changePercent?: number; dayVolume?: number } = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0;

  const readVarint = () => {
    let result = 0n;
    let shift = 0n;
    while (i < bytes.length) {
      const b = bytes[i++];
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  };

  while (i < bytes.length) {
    const tag = Number(readVarint());
    const field = tag >>> 3;
    const wire = tag & 0x7;

    if (wire === 0) {
      const v = readVarint();
      if (field === 3) out.time = Number(v);          // sint64 (aproximado)
      if (field === 11) out.dayVolume = Number(v);
    } else if (wire === 1) {                          // 64-bit
      i += 8;
    } else if (wire === 2) {                          // length-delimited
      const len = Number(readVarint());
      if (field === 1) out.id = new TextDecoder().decode(bytes.subarray(i, i + len));
      i += len;
    } else if (wire === 5) {                          // 32-bit float
      const v = view.getFloat32(i, true);
      if (field === 2) out.price = v;
      if (field === 8) out.changePercent = v;
      i += 4;
    } else {
      break; // wire type não suportado
    }
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve((req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);
  let yahoo: WebSocket | null = null;
  let pending: string[] = [];
  let closed = false;

  const connectYahoo = () => {
    yahoo = new WebSocket("wss://streamer.finance.yahoo.com/?version=2");
    yahoo.onopen = () => {
      if (pending.length && yahoo?.readyState === WebSocket.OPEN) {
        yahoo.send(JSON.stringify({ subscribe: pending }));
      }
    };
    yahoo.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const bytes = base64ToBytes(ev.data);
        const q = decodePricingData(bytes);
        if (q.id && q.price != null && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(q));
        }
      } catch (e) {
        console.warn("decode error:", e);
      }
    };
    yahoo.onerror = (e) => console.warn("yahoo ws error:", (e as any).message ?? e);
    yahoo.onclose = () => {
      if (!closed && client.readyState === WebSocket.OPEN) {
        setTimeout(connectYahoo, 2000); // reconecta
      }
    };
  };

  client.onopen = () => connectYahoo();

  client.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (Array.isArray(msg.subscribe)) {
        pending = msg.subscribe.slice(0, 50);
        if (yahoo?.readyState === WebSocket.OPEN) {
          yahoo.send(JSON.stringify({ subscribe: pending }));
        }
      } else if (Array.isArray(msg.unsubscribe) && yahoo?.readyState === WebSocket.OPEN) {
        yahoo.send(JSON.stringify({ unsubscribe: msg.unsubscribe }));
      }
    } catch { /* ignore */ }
  };

  client.onclose = () => {
    closed = true;
    try { yahoo?.close(); } catch { /* ignore */ }
  };

  return response;
});
