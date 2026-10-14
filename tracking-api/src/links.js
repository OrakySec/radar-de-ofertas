// Gera um link de convite ÚNICO do Telegram por visita ao site.
//
// Chamado quando a pessoa abre o modal de escolha de canal: o link é de uso
// único (member_limit = 1) e expira em poucas horas. Guardamos de onde veio o
// clique (fbc/fbp/IP/UA/gclid/utm) — quando alguém entra por esse link, o bot
// sabe exatamente a origem, sem nenhum passo extra pra pessoa.
const crypto = require('crypto');

class LinkError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'LinkError';
    this.status = status;
    this.code = code;
  }
}

const clip = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const chatParam = (id) => (/^-?\d+$/.test(id) ? Number(id) : id);

function createLinkService({ cfg, db, tg, now = () => Date.now() }) {
  const t = cfg.telegram;

  const categoryToChat = new Map();
  for (const [chatId, category] of t.chats) categoryToChat.set(category, chatId);

  const hitsByIp = new Map();
  let hitsGlobal = [];
  let cooldownUntil = 0;

  const recent = (arr, windowMs, nowMs) => arr.filter((ts) => nowMs - ts < windowMs);

  function checkRate(ip, nowMs) {
    if (nowMs < cooldownUntil) throw new LinkError(503, 'telegram_ocupado');

    const ipHits = recent(hitsByIp.get(ip) || [], t.rateIp.windowMs, nowMs);
    if (ipHits.length >= t.rateIp.max) throw new LinkError(429, 'limite_por_visitante');

    hitsGlobal = recent(hitsGlobal, t.rateGlobal.windowMs, nowMs);
    if (hitsGlobal.length >= t.rateGlobal.max) throw new LinkError(429, 'limite_global');

    ipHits.push(nowMs);
    hitsByIp.set(ip, ipHits);
    hitsGlobal.push(nowMs);

    if (hitsByIp.size > 5000) {
      for (const [k, v] of hitsByIp) {
        if (!recent(v, t.rateIp.windowMs, nowMs).length) hitsByIp.delete(k);
      }
    }
  }

  function makeName(category) {
    // Nome do link (até 32 caracteres no Telegram): serve de chave de busca.
    return `${category.slice(0, 3)}-${crypto.randomBytes(6).toString('base64url').slice(0, 8)}`;
  }

  async function issue(category, info = {}) {
    const chatId = categoryToChat.get(category);
    if (!chatId) throw new LinkError(404, 'categoria_sem_grupo_telegram');

    const nowMs = now();
    const nowSec = Math.floor(nowMs / 1000);
    const ip = clip(info.ip, 64) || 'desconhecido';
    const ua = clip(info.ua, 300);
    const fbp = clip(info.fbp, 120);
    // Mesmo visitante abrindo o modal de novo -> reaproveita o link (não gasta link à toa).
    const clickKey = fbp || sha(`${ip}|${ua || ''}`).slice(0, 16);

    const existing = db.findReusableInvite(clickKey, category, nowSec - 30 * 60, nowSec);
    if (existing) return { url: existing.invite_link, reused: true };

    checkRate(ip, nowMs);

    const name = makeName(category);
    let link;
    try {
      link = await tg.call('createChatInviteLink', {
        chat_id: chatParam(chatId),
        name,
        expire_date: nowSec + t.linkTtlHours * 3600,
        member_limit: 1,
      });
    } catch (e) {
      // O Telegram pediu pra esperar: segura novos pedidos até lá (o site cai no link fixo).
      if (e.retryAfter) cooldownUntil = nowMs + e.retryAfter * 1000;
      throw e;
    }

    db.insertInvite({
      category,
      chat_id: chatId,
      name,
      invite_link: link.invite_link,
      click_key: clickKey,
      created_at: nowSec,
      expires_at: nowSec + t.linkTtlHours * 3600,
      fbc: clip(info.fbc, 200),
      fbp,
      ip,
      ua,
      source_url: clip(info.sourceUrl, 500),
      gclid: clip(info.gclid, 200),
      utm_source: clip(info.utm_source, 100),
      utm_medium: clip(info.utm_medium, 100),
      utm_campaign: clip(info.utm_campaign, 150),
      utm_content: clip(info.utm_content, 150),
    });

    return { url: link.invite_link, reused: false };
  }

  return { issue };
}

module.exports = { createLinkService, LinkError };
