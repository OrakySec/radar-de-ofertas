// Monta o app Express + o bot do Telegram. Separado do server.js pra dar pra
// testar tudo com servidores falsos do Telegram/Meta (ver test/flow.test.js).
const express = require('express');
const cors = require('cors');

const { loadConfig } = require('./config');
const { openDb } = require('./db');
const { createTelegram } = require('./telegram');
const { createMeta } = require('./meta');
const { createLinkService, LinkError } = require('./links');
const { createBot } = require('./bot');

function buildApp(env = process.env, deps = {}) {
  const cfg = loadConfig(env);
  const log = deps.log || console;
  const now = deps.now || (() => Date.now());

  const meta = createMeta(cfg.meta, deps.fetch);

  // O bot só liga se tiver token. Com token mas sem TELEGRAM_CHATS ele roda só
  // pros comandos de configuração (/id e /chatid) — é o passo-a-passo inicial.
  const botEnabled = Boolean(cfg.telegram.token);
  const db = botEnabled ? openDb(cfg.dbPath) : null;
  const tg = botEnabled
    ? createTelegram({ token: cfg.telegram.token, apiBase: cfg.telegram.apiBase, fetchImpl: deps.fetch })
    : null;
  const bot = botEnabled ? createBot({ cfg, db, tg, meta, now, log }) : null;
  const links = botEnabled && cfg.telegram.chats.size ? createLinkService({ cfg, db, tg, now }) : null;

  const app = express();

  // Atrás do Traefik: sem isso, req.ip seria o IP interno do proxy, não o
  // do visitante — e a Meta usa client_ip_address pra qualidade do match.
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json());

  app.get('/api/tracking/health', (_req, res) => {
    res.json({
      ok: true,
      configured: meta.enabled,
      telegram: { bot: botEnabled, groups: cfg.telegram.chats.size, links: Boolean(links) },
    });
  });

  // Eventos do navegador -> Meta Conversions API (mesmo eventId do Pixel pra deduplicar).
  app.post('/api/tracking/meta-event', async (req, res) => {
    if (!meta.enabled) {
      // Tracking não configurado ainda (env vars vazias) — não é erro do
      // cliente, só ainda não foi ligado. Responde ok pra não gerar ruído
      // de rede no navegador do visitante.
      return res.json({ success: false, skipped: true, reason: 'CAPI não configurado' });
    }

    const { eventName, eventId, sourceUrl, userAgent, fbc, fbp } = req.body || {};
    if (!eventName || !eventId) {
      return res.status(400).json({ success: false, error: 'eventName e eventId são obrigatórios' });
    }

    try {
      const r = await meta.send({
        event_name: eventName,
        event_time: Math.floor(now() / 1000),
        event_id: eventId,
        event_source_url: sourceUrl,
        action_source: 'website',
        user_data: {
          client_ip_address: req.ip,
          client_user_agent: userAgent,
          ...(fbc && { fbc }),
          ...(fbp && { fbp }),
        },
      });
      res.status(r.ok ? 200 : 502).json({ success: r.ok, fbData: r.body });
    } catch (err) {
      res.status(502).json({ success: false, error: String(err) });
    }
  });

  // O site pede um link de convite ÚNICO do Telegram quando a pessoa abre o
  // modal de escolha de canal. Se der qualquer erro, o site usa o link fixo.
  app.post('/api/tracking/telegram-link', async (req, res) => {
    if (!links) return res.status(503).json({ ok: false, error: 'telegram_nao_configurado' });

    const b = req.body || {};
    try {
      const out = await links.issue(String(b.category || ''), {
        ip: req.ip,
        ua: req.get('user-agent'),
        fbc: b.fbc,
        fbp: b.fbp,
        sourceUrl: b.sourceUrl,
        gclid: b.gclid,
        utm_source: b.utm_source,
        utm_medium: b.utm_medium,
        utm_campaign: b.utm_campaign,
        utm_content: b.utm_content,
      });
      res.json({ ok: true, url: out.url, reused: out.reused });
    } catch (e) {
      if (e instanceof LinkError) return res.status(e.status).json({ ok: false, error: e.code });
      log.error(`[links] ${e.message}`);
      res.status(502).json({ ok: false, error: 'falha_ao_gerar_link' });
    }
  });

  async function close() {
    if (bot) await bot.stop();
    if (db) db.close();
  }

  return { app, cfg, bot, db, meta, close };
}

module.exports = { buildApp };
