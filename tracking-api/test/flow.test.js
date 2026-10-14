// Teste de ponta a ponta do bot do Telegram e do envio pra Meta, usando
// servidores FALSOS do Telegram e do Graph API (sem token real, sem rede).
//
//   cd tracking-api && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { buildApp } = require('../src/app');

const BOT_TOKEN = 'BOTTOKEN';
const CHAT = '-1001';
const quiet = { log() {}, warn() {}, error() {} };

// ---- servidores falsos ------------------------------------------------------

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const urlOf = (server) => `http://127.0.0.1:${server.address().port}`;

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

async function startFakeTelegram() {
  const state = { queue: [], links: [], sent: [], revoked: [], failCreate: null };
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
    const ok = (result) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, result }));
    };
    const fail = (error_code, description, parameters) => {
      res.statusCode = error_code;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error_code, description, parameters }));
    };
    if (!m || m[1] !== BOT_TOKEN) return fail(401, 'Unauthorized');

    switch (m[2]) {
      case 'getMe':
        return ok({ id: 1, is_bot: true, username: 'radar_test_bot' });
      case 'deleteWebhook':
        return ok(true);
      case 'getUpdates': {
        const pending = state.queue.filter((u) => u.update_id >= (body.offset || 0));
        if (pending.length) return ok(pending);
        await new Promise((r) => setTimeout(r, 60)); // finge o long polling
        return ok([]);
      }
      case 'createChatInviteLink': {
        if (state.failCreate) return fail(...state.failCreate);
        const link = {
          invite_link: `https://t.me/+STUB${state.links.length + 1}`,
          name: body.name,
          member_limit: body.member_limit,
          expire_date: body.expire_date,
          chat_id: body.chat_id,
        };
        state.links.push(link);
        return ok(link);
      }
      case 'revokeChatInviteLink':
        state.revoked.push(body.invite_link);
        return ok({ invite_link: body.invite_link, is_revoked: true });
      case 'sendMessage':
        state.sent.push(body);
        return ok({ message_id: 1 });
      default:
        return fail(404, 'Not Found');
    }
  });
  await listen(server);
  return { server, state, url: urlOf(server) };
}

async function startFakeGraph() {
  const state = { events: [], status: 200 };
  const server = http.createServer(async (req, res) => {
    state.events.push({ path: req.url, body: await readJson(req) });
    res.statusCode = state.status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(state.status === 200 ? { events_received: 1 } : { error: { message: 'boom' } }));
  });
  await listen(server);
  return { server, state, url: urlOf(server) };
}

// ---- ambiente de teste ------------------------------------------------------

async function setup({ withTelegram = true, clock } = {}) {
  const tg = await startFakeTelegram();
  const graph = await startFakeGraph();

  const env = {
    PORT: '0',
    DB_PATH: ':memory:',
    META_PIXEL_ID: 'PIX',
    META_CAPI_TOKEN: 'TOK',
    META_GRAPH_BASE: graph.url,
    META_TEST_EVENT_CODE: 'TEST1',
    TELEGRAM_API_BASE: tg.url,
    TELEGRAM_POLL_TIMEOUT: '1',
    ...(withTelegram && {
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      TELEGRAM_CHATS: `impressao3d:${CHAT}`,
      TELEGRAM_ADMIN_IDS: '42',
    }),
  };

  const built = buildApp(env, { log: quiet, ...(clock && { now: () => clock.t }) });
  const server = await listen(http.createServer(built.app));
  if (built.bot) await built.bot.start();

  const base = urlOf(server);
  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'UA-TEST', ...headers },
      body: JSON.stringify(body),
    });

  async function teardown() {
    await built.close();
    for (const s of [server, tg.server, graph.server]) {
      s.closeAllConnections?.();
      await new Promise((r) => s.close(r));
    }
  }

  return { ...built, tg, graph, base, post, teardown };
}

async function waitFor(predicate, ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor: tempo esgotado');
}

const nowSec = () => Math.floor(Date.now() / 1000);

const joinUpdate = (id, userId, inviteLink, at = nowSec()) => ({
  update_id: id,
  chat_member: {
    chat: { id: Number(CHAT), type: 'supergroup' },
    from: { id: userId },
    date: at,
    old_chat_member: { status: 'left', user: { id: userId, is_bot: false } },
    new_chat_member: { status: 'member', user: { id: userId, is_bot: false } },
    ...(inviteLink && { invite_link: inviteLink }),
  },
});

const leaveUpdate = (id, userId, at = nowSec()) => ({
  update_id: id,
  chat_member: {
    chat: { id: Number(CHAT), type: 'supergroup' },
    from: { id: userId },
    date: at,
    old_chat_member: { status: 'member', user: { id: userId, is_bot: false } },
    new_chat_member: { status: 'left', user: { id: userId, is_bot: false } },
  },
});

const adminMsg = (id, text, userId = 42, chatType = 'private') => ({
  update_id: id,
  message: { message_id: id, from: { id: userId }, chat: { id: userId, type: chatType }, text },
});

// ---- testes ------------------------------------------------------------------

test('fluxo completo: link único -> entrada pelo link -> evento pra Meta -> /stats', async () => {
  const t = await setup();
  try {
    const body = {
      category: 'impressao3d',
      fbc: 'fb.1.111.abc',
      fbp: 'fb.1.222.333',
      sourceUrl: 'https://rdo.test/impressao-3d?utm_source=instagram',
      gclid: 'G123',
      utm_source: 'instagram',
      utm_campaign: '3d',
    };

    // 1) o site pede um link único
    const r1 = await t.post('/api/tracking/telegram-link', body, { 'x-forwarded-for': '1.1.1.1' });
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.equal(j1.ok, true);
    assert.equal(j1.url, 'https://t.me/+STUB1');
    assert.equal(j1.reused, false);

    const created = t.tg.state.links[0];
    assert.match(created.name, /^imp-/);
    assert.equal(created.member_limit, 1);
    assert.equal(created.chat_id, -1001); // número, não string
    assert.ok(created.expire_date > nowSec());

    // 2) o mesmo visitante abre o modal de novo: reaproveita, não gasta outro link
    const r2 = await t.post('/api/tracking/telegram-link', body, { 'x-forwarded-for': '1.1.1.1' });
    const j2 = await r2.json();
    assert.equal(j2.url, j1.url);
    assert.equal(j2.reused, true);
    assert.equal(t.tg.state.links.length, 1);

    // 3) alguém entra no grupo por esse link
    t.tg.state.queue.push(joinUpdate(100, 7, { invite_link: j1.url, name: created.name }));
    await waitFor(() => t.graph.state.events.length === 1);

    const sent = t.graph.state.events[0];
    assert.match(sent.path, /^\/v19\.0\/PIX\/events\?access_token=TOK$/);
    assert.equal(sent.body.test_event_code, 'TEST1');
    const ev = sent.body.data[0];
    assert.equal(ev.event_name, 'JoinGroupConfirmed');
    assert.equal(ev.event_id, 'tgjoin-1');
    assert.equal(ev.action_source, 'website');
    assert.equal(ev.event_source_url, body.sourceUrl);
    assert.equal(ev.user_data.fbc, 'fb.1.111.abc');
    assert.equal(ev.user_data.fbp, 'fb.1.222.333');
    assert.equal(ev.user_data.client_ip_address, '1.1.1.1');
    assert.equal(ev.user_data.client_user_agent, 'UA-TEST');
    assert.deepEqual(ev.custom_data, { category: 'impressao3d', channel: 'telegram', source: 'telegram_bot' });

    await waitFor(() => t.db.getInvite(1).capi_status === 'sent');
    const inv = t.db.getInvite(1);
    assert.ok(inv.joined_at);
    assert.equal(inv.utm_source, 'instagram');
    assert.equal(inv.gclid, 'G123');
    // nunca guarda o id do Telegram puro
    assert.match(inv.joined_user, /^[0-9a-f]{16}$/);

    // 4) o admin pede o relatório
    t.tg.state.queue.push(adminMsg(101, '/stats 7'));
    await waitFor(() => t.tg.state.sent.length === 1);
    const text = t.tg.state.sent[0].text;
    assert.match(text, /Impressão 3D/);
    assert.match(text, /Entradas: 1 · Saídas: 0 · Saldo: \+1/);
    assert.match(text, /pelo link do site \(com origem\): 1 \(100%\)/);
    assert.match(text, /Links gerados no site: 1 → entraram: 1 \(100%\)/);
    assert.match(text, /Enviadas ao Meta: 1/);
    assert.match(text, /Por origem: instagram 1/);
  } finally {
    await t.teardown();
  }
});

test('entrada por outro link conta sem origem; saída conta; update repetido não duplica; bots e grupos alheios são ignorados', async () => {
  const t = await setup();
  try {
    const since = nowSec() - 60;

    // entrou pelo link fixo (que o bot não criou): conta, mas sem origem
    const u = joinUpdate(200, 8, { invite_link: 'https://t.me/+fixo...', name: 'Link do site' });
    await t.bot.handleUpdate(u);
    await t.bot.handleUpdate(u); // o Telegram reentregou o mesmo update

    await t.bot.handleUpdate(leaveUpdate(201, 8));

    // bot entrando e grupo que não monitoramos: ignorados
    const bot = joinUpdate(202, 9);
    bot.chat_member.new_chat_member.user.is_bot = true;
    await t.bot.handleUpdate(bot);
    const outro = joinUpdate(203, 10);
    outro.chat_member.chat.id = -999;
    await t.bot.handleUpdate(outro);

    const ev = t.db.eventsSince('impressao3d', since);
    assert.equal(ev.filter((e) => e.kind === 'join').length, 1);
    assert.equal(ev.filter((e) => e.kind === 'leave').length, 1);
    assert.equal(ev.find((e) => e.kind === 'join').via, 'other_link');
    assert.equal(t.graph.state.events.length, 0); // sem origem, nada vai pra Meta
  } finally {
    await t.teardown();
  }
});

test('comandos: /id e /chatid no passo-a-passo; /stats só pra admin', async () => {
  const t = await setup();
  try {
    // quem não é admin
    t.tg.state.queue.push(adminMsg(300, '/id', 55));
    t.tg.state.queue.push(adminMsg(301, '/stats', 55));
    t.tg.state.queue.push(adminMsg(302, '/chatid@radar_test_bot', 42, 'supergroup')); // admin dentro do grupo
    await waitFor(() => t.tg.state.sent.length === 3);

    assert.equal(t.tg.state.sent[0].text, 'Seu user id: 55');
    assert.match(t.tg.state.sent[1].text, /Sem permissão/);
    assert.match(t.tg.state.sent[2].text, /Id deste chat: 42/);
  } finally {
    await t.teardown();
  }
});

test('limite por visitante (429), categoria sem grupo (404) e fallback quando o Telegram falha', async () => {
  const t = await setup();
  try {
    const ask = (ip, ua) =>
      t.post('/api/tracking/telegram-link', { category: 'impressao3d' }, { 'x-forwarded-for': ip, 'user-agent': ua });

    // 5 visitantes diferentes do MESMO IP (sem fbp) -> 5 links; o 6º é barrado
    for (let i = 0; i < 5; i++) assert.equal((await ask('2.2.2.2', `UA-${i}`)).status, 200);
    const blocked = await ask('2.2.2.2', 'UA-5');
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error, 'limite_por_visitante');

    // categoria sem grupo do Telegram
    const none = await t.post('/api/tracking/telegram-link', { category: 'games' }, { 'x-forwarded-for': '3.3.3.3' });
    assert.equal(none.status, 404);

    // Telegram devolve 429 "espere 60s": responde erro (o site usa o link fixo) e segura novos pedidos
    t.tg.state.failCreate = [429, 'Too Many Requests', { retry_after: 60 }];
    assert.equal((await ask('4.4.4.4', 'UA-x')).status, 502);
    t.tg.state.failCreate = null;
    const cool = await ask('5.5.5.5', 'UA-y');
    assert.equal(cool.status, 503);
    assert.equal((await cool.json()).error, 'telegram_ocupado');
  } finally {
    await t.teardown();
  }
});

test('manutenção: revoga links usados/expirados e apaga dados pessoais depois da retenção', async () => {
  const clock = { t: Date.now() };
  const t = await setup({ clock });
  try {
    const r = await t.post('/api/tracking/telegram-link', { category: 'impressao3d', fbc: 'fb.1.1.x', fbp: 'fb.1.2.3' }, { 'x-forwarded-for': '6.6.6.6' });
    const { url } = await r.json();
    const name = t.tg.state.links[0].name;

    // alguém entra e outro link nasce e fica sem uso
    t.tg.state.queue.push(joinUpdate(400, 11, { invite_link: url, name }));
    await waitFor(() => t.graph.state.events.length === 1);
    await t.post('/api/tracking/telegram-link', { category: 'impressao3d', fbp: 'fb.1.9.9' }, { 'x-forwarded-for': '7.7.7.7' });
    assert.equal(t.tg.state.links.length, 2);

    // 2 dias depois: o usado e o expirado são revogados
    clock.t += 2 * 86400 * 1000;
    await t.bot.cleanup();
    assert.deepEqual([...t.tg.state.revoked].sort(), ['https://t.me/+STUB1', 'https://t.me/+STUB2']);

    // 100 dias depois: dados pessoais do clique somem (o contador fica)
    assert.ok(t.db.getInvite(1).ip);
    clock.t += 100 * 86400 * 1000;
    await t.bot.cleanup();
    const inv = t.db.getInvite(1);
    assert.equal(inv.ip, null);
    assert.equal(inv.fbc, null);
    assert.equal(inv.fbp, null);
    assert.ok(inv.joined_at);
  } finally {
    await t.teardown();
  }
});

test('se a Meta recusar o evento, fica marcado como erro e é reenviado na manutenção', async () => {
  const t = await setup();
  try {
    t.graph.state.status = 500;
    const r = await t.post('/api/tracking/telegram-link', { category: 'impressao3d', fbp: 'fb.1.2.3' }, { 'x-forwarded-for': '8.8.8.8' });
    const { url } = await r.json();
    t.tg.state.queue.push(joinUpdate(500, 12, { invite_link: url, name: t.tg.state.links[0].name }));

    await waitFor(() => (t.db.getInvite(1) || {}).capi_status === 'error:500');

    t.graph.state.status = 200;
    await t.bot.cleanup();
    assert.equal(t.db.getInvite(1).capi_status, 'sent');
    assert.equal(t.graph.state.events.length, 2); // a tentativa que falhou + o reenvio
  } finally {
    await t.teardown();
  }
});

test('sem token do Telegram: bot desligado, links dão 503 e o /meta-event continua funcionando', async () => {
  const t = await setup({ withTelegram: false });
  try {
    assert.equal(t.bot, null);

    const health = await (await fetch(t.base + '/api/tracking/health')).json();
    assert.deepEqual(health, { ok: true, configured: true, telegram: { bot: false, groups: 0, links: false } });

    const link = await t.post('/api/tracking/telegram-link', { category: 'impressao3d' });
    assert.equal(link.status, 503);

    // rota que já existia antes do bot
    const bad = await t.post('/api/tracking/meta-event', { eventName: 'JoinGroup' });
    assert.equal(bad.status, 400);

    const ok = await t.post(
      '/api/tracking/meta-event',
      { eventName: 'JoinGroup', eventId: 'abc', sourceUrl: 'https://rdo.test/', userAgent: 'UA-X', fbp: 'fb.1.2.3' },
      { 'x-forwarded-for': '9.9.9.9' }
    );
    assert.equal(ok.status, 200);
    const ev = t.graph.state.events[0].body.data[0];
    assert.equal(ev.event_name, 'JoinGroup');
    assert.equal(ev.event_id, 'abc');
    assert.equal(ev.user_data.client_ip_address, '9.9.9.9');
    assert.equal(ev.user_data.client_user_agent, 'UA-X');
    assert.equal(ev.user_data.fbp, 'fb.1.2.3');
  } finally {
    await t.teardown();
  }
});
