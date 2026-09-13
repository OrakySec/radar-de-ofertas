// Radar de Ofertas — tracking-api
//
// Único trabalho deste serviço: receber o POST que o script.js do site
// dispara a cada clique de "Entrar no grupo" e repassar pra Meta
// Conversions API (server-side), usando o MESMO eventId que o Pixel do
// navegador já mandou — isso deixa o Meta deduplicar os dois e evitar
// contar o mesmo clique duas vezes.
//
// Nunca reutilize o token de outro projeto/pixel: gere um token novo em
// Meta Events Manager > Configurações de eventos > Conversions API.

const express = require('express');
const cors = require('cors');

const app = express();

// Atrás do Traefik: sem isso, req.ip seria o IP interno do proxy, não o
// do visitante — e a Meta usa client_ip_address pra qualidade do match.
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v19.0';

app.get('/api/tracking/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(META_PIXEL_ID && META_CAPI_TOKEN) });
});

app.post('/api/tracking/meta-event', async (req, res) => {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    // Tracking não configurado ainda (env vars vazias) — não é erro do
    // cliente, só ainda não foi ligado. Responde ok pra não gerar ruído
    // de rede no navegador do visitante.
    return res.json({ success: false, skipped: true, reason: 'CAPI não configurado' });
  }

  const { eventName, eventId, sourceUrl, userAgent, fbc, fbp } = req.body || {};
  if (!eventName || !eventId) {
    return res.status(400).json({ success: false, error: 'eventName e eventId são obrigatórios' });
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: sourceUrl,
        action_source: 'website',
        user_data: {
          client_ip_address: req.ip,
          client_user_agent: userAgent,
          ...(fbc && { fbc }),
          ...(fbp && { fbp }),
        },
      },
    ],
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const fbData = await r.json();
    res.status(r.ok ? 200 : 502).json({ success: r.ok, fbData });
  } catch (err) {
    res.status(502).json({ success: false, error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[radar-tracking-api] ouvindo na porta ${PORT}`);
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    console.warn('[radar-tracking-api] META_PIXEL_ID/META_CAPI_TOKEN não configurados — eventos serão ignorados (skipped).');
  }
});
