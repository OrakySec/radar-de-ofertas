// Envio de eventos pra Meta Conversions API (server-side).

function createMeta(cfg, fetchImpl = fetch) {
  const enabled = Boolean(cfg.pixelId && cfg.token);

  // `event` é UM evento no formato da CAPI (event_name, event_time, ...).
  async function send(event) {
    if (!enabled) return { skipped: true };

    const payload = { data: [event] };
    if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;

    const url =
      `${cfg.graphBase}/${cfg.graphVersion}/${cfg.pixelId}/events` +
      `?access_token=${encodeURIComponent(cfg.token)}`;

    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    let body = null;
    try {
      body = await r.json();
    } catch {
      /* resposta sem JSON */
    }
    return { ok: r.ok, status: r.status, body };
  }

  return { enabled, send };
}

module.exports = { createMeta };
