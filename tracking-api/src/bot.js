// Bot do Telegram: conta as entradas/saídas dos grupos e liga cada entrada
// ao clique do site que a originou.
//
// Como funciona:
//  - O bot é ADMIN do grupo e recebe os updates `chat_member` (quem entrou /
//    saiu e por qual link de convite) via long polling (getUpdates).
//  - Entrou por um link único gerado pelo site (links.js)? Então sabemos de
//    qual visita veio: marcamos o link como usado e mandamos pra Meta um
//    evento server-side "JoinGroupConfirmed" com o fbc/fbp/IP/UA guardados.
//  - Entrou por outro caminho (link fixo, busca)? Conta do mesmo jeito, só
//    que sem origem ("other_link").
//  - Comandos (só pra quem está em TELEGRAM_ADMIN_IDS): /stats [dias].
const crypto = require('crypto');
const { buildStats } = require('./stats');

const ALLOWED_UPDATES = ['chat_member', 'message'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELP = [
  'Eu conto as entradas dos grupos do Radar de Ofertas.',
  '',
  '/id — mostra o seu user id',
  '/chatid — mostra o id do chat (use dentro do grupo)',
  '/stats [dias] — relatório de entradas (padrão: 7 dias)',
].join('\n');

function createBot({ cfg, db, tg, meta, now = () => Date.now(), log = console }) {
  const t = cfg.telegram;
  const categories = [...new Set(t.chats.values())];

  let running = false;
  let abort = null;
  let loopPromise = null;
  let cleanupTimer = null;

  const nowSec = () => Math.floor(now() / 1000);
  const userHash = (id) => crypto.createHmac('sha256', t.hashKey).update(String(id)).digest('hex').slice(0, 16);

  // ---- entradas / saídas -------------------------------------------------

  const isMember = (m) =>
    Boolean(m) &&
    (m.status === 'member' ||
      m.status === 'administrator' ||
      m.status === 'creator' ||
      (m.status === 'restricted' && m.is_member === true));

  function classify(oldMember, newMember) {
    const was = isMember(oldMember);
    const is = isMember(newMember);
    if (!was && is) return 'join';
    if (was && !is) return 'leave';
    return null;
  }

  function buildConfirmedEvent(invite, atSec) {
    const event = {
      event_name: 'JoinGroupConfirmed',
      event_time: Math.min(atSec, nowSec()),
      event_id: `tgjoin-${invite.id}`,
      action_source: 'website',
      user_data: {
        client_ip_address: invite.ip,
        client_user_agent: invite.ua,
        ...(invite.fbc && { fbc: invite.fbc }),
        ...(invite.fbp && { fbp: invite.fbp }),
      },
      custom_data: { category: invite.category, channel: 'telegram', source: 'telegram_bot' },
    };
    if (invite.source_url) event.event_source_url = invite.source_url;
    return event;
  }

  async function reportConfirmedJoin(invite, atSec) {
    if (!meta.enabled) {
      db.setCapiStatus(invite.id, 'skipped');
      return;
    }
    try {
      const r = await meta.send(buildConfirmedEvent(invite, atSec));
      db.setCapiStatus(invite.id, r.ok ? 'sent' : `error:${r.status}`);
      if (!r.ok) log.warn(`[bot] Meta recusou o evento do convite ${invite.id}: HTTP ${r.status}`);
    } catch (e) {
      db.setCapiStatus(invite.id, `error:${e.name}`);
      log.warn(`[bot] falha ao enviar evento do convite ${invite.id} pra Meta (${e.name})`);
    }
  }

  async function onChatMember(update) {
    const cm = update.chat_member;
    const chatId = String(cm.chat.id);
    const category = t.chats.get(chatId);
    if (!category) return; // grupo que não monitoramos

    const user = cm.new_chat_member && cm.new_chat_member.user;
    if (!user || user.is_bot) return;

    const kind = classify(cm.old_chat_member, cm.new_chat_member);
    if (!kind) return;

    const hash = userHash(user.id);
    let via = 'n/a';
    let invite = null;

    if (kind === 'join') {
      via = 'unknown';
      if (cm.invite_link) {
        invite = db.findInvite(chatId, cm.invite_link.invite_link, cm.invite_link.name);
        via = invite ? 'site_link' : 'other_link';
      } else if (cm.via_join_request) {
        via = 'join_request';
      }
    }

    const inserted = db.insertMemberEvent({
      update_id: update.update_id,
      chat_id: chatId,
      category,
      kind,
      at: cm.date,
      user_hash: hash,
      via,
      invite_name: cm.invite_link ? cm.invite_link.name || null : null,
      invite_id: invite ? invite.id : null,
    });
    if (!inserted) return; // update repetido: já contado

    if (kind === 'join' && invite && !invite.joined_at) {
      db.markJoined(invite.id, hash, cm.date);
      await reportConfirmedJoin(db.getInvite(invite.id), cm.date);
    }
  }

  // ---- comandos ----------------------------------------------------------

  async function reply(chatId, text) {
    try {
      await tg.call('sendMessage', { chat_id: chatId, text });
    } catch (e) {
      log.warn(`[bot] não consegui responder no chat ${chatId}: ${e.message}`);
    }
  }

  async function onMessage(update) {
    const m = update.message;
    if (!m || typeof m.text !== 'string' || !m.text.startsWith('/')) return;

    const [raw, ...args] = m.text.trim().split(/\s+/);
    const cmd = raw.split('@')[0].toLowerCase();
    const fromId = String(m.from && m.from.id);
    const isPrivate = m.chat.type === 'private';
    const isAdmin = t.adminIds.has(fromId);
    const setupMode = t.adminIds.size === 0; // ainda sem TELEGRAM_ADMIN_IDS: libera só /id e /chatid

    if (cmd === '/id' && isPrivate) {
      return reply(m.chat.id, `Seu user id: ${fromId}`);
    }
    if (cmd === '/chatid' && (setupMode || isAdmin)) {
      return reply(m.chat.id, `Id deste chat: ${m.chat.id}`);
    }
    if (cmd === '/stats') {
      if (!isAdmin) {
        if (isPrivate) {
          await reply(m.chat.id, 'Sem permissão. Coloque o seu user id (use /id) em TELEGRAM_ADMIN_IDS.');
        }
        return;
      }
      const days = Math.min(Math.max(parseInt(args[0], 10) || 7, 1), 365);
      return reply(m.chat.id, buildStats({ db, categories, days, nowSec: nowSec() }));
    }
    if ((cmd === '/start' || cmd === '/help') && isPrivate) {
      return reply(m.chat.id, HELP);
    }
  }

  async function handleUpdate(update) {
    try {
      if (update.chat_member) await onChatMember(update);
      else if (update.message) await onMessage(update);
    } catch (e) {
      // Um update com problema não pode travar a fila: loga e segue.
      log.error(`[bot] erro processando update ${update.update_id}: ${e.message}`);
    }
  }

  // ---- manutenção --------------------------------------------------------

  // Revoga links já usados/expirados (o Telegram limita quantos links ativos
  // um grupo pode ter), tenta de novo os envios pra Meta que falharam e apaga
  // os dados pessoais do clique depois do prazo de retenção.
  async function cleanup() {
    const n = nowSec();

    for (const inv of db.cleanupCandidates(n, 30)) {
      try {
        await tg.call('revokeChatInviteLink', {
          chat_id: /^-?\d+$/.test(inv.chat_id) ? Number(inv.chat_id) : inv.chat_id,
          invite_link: inv.invite_link,
        });
        db.markRevoked(inv.id);
      } catch (e) {
        // 400 = link já inválido/inexistente: nada mais a fazer, não tenta de novo.
        if (e.code === 400) db.markRevoked(inv.id);
        else if (e.retryAfter) break;
      }
      await sleep(150);
    }

    for (const inv of db.pendingCapi(n - 6 * 86400)) {
      await reportConfirmedJoin(inv, inv.joined_at);
    }

    const purged = db.purgePersonalData(n - t.retentionDays * 86400);
    if (purged) log.log(`[bot] dados pessoais de ${purged} clique(s) apagados (retenção de ${t.retentionDays} dias)`);
  }

  // ---- loop de polling ---------------------------------------------------

  async function loop() {
    let offset = Number(db.getKv('offset') || 0);
    let backoff = 1000;

    while (running) {
      try {
        const updates = await tg.call(
          'getUpdates',
          { offset, timeout: t.pollTimeoutSec, allowed_updates: ALLOWED_UPDATES },
          { timeoutMs: (t.pollTimeoutSec + 10) * 1000, signal: abort.signal }
        );
        backoff = 1000;
        for (const u of updates) {
          await handleUpdate(u);
          offset = u.update_id + 1;
          db.setKv('offset', offset);
        }
      } catch (e) {
        if (!running) break;
        log.warn(`[bot] polling: ${e.message}`);
        await sleep(e.retryAfter ? e.retryAfter * 1000 : backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  }

  async function start() {
    if (running) return;
    running = true;
    abort = new AbortController();

    try {
      const me = await tg.call('getMe');
      log.log(`[bot] online como @${me.username}; grupos monitorados: ${categories.join(', ') || '(nenhum ainda)'}`);
      // getUpdates não funciona com webhook ativo.
      await tg.call('deleteWebhook', { drop_pending_updates: false });
    } catch (e) {
      log.warn(`[bot] não consegui validar o bot agora (${e.message}); tentando seguir mesmo assim`);
    }

    loopPromise = loop();
    cleanupTimer = setInterval(() => cleanup().catch((e) => log.warn(`[bot] cleanup: ${e.message}`)), 30 * 60 * 1000);
    cleanupTimer.unref();
  }

  async function stop() {
    running = false;
    if (abort) abort.abort();
    if (cleanupTimer) clearInterval(cleanupTimer);
    if (loopPromise) await loopPromise.catch(() => {});
  }

  return { start, stop, handleUpdate, cleanup, categories };
}

module.exports = { createBot };
