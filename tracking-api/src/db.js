// Banco do bot (SQLite embutido no Node, arquivo único num volume).
// Todos os horários são unix em SEGUNDOS.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT
);

-- Um link de convite ÚNICO por visita ao site (uso único, expira). Guarda de
-- onde veio o clique pra, quando alguém entrar por ele, saber a origem exata.
CREATE TABLE IF NOT EXISTS invites (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL,
  chat_id      TEXT NOT NULL,
  name         TEXT NOT NULL UNIQUE,
  invite_link  TEXT NOT NULL,
  click_key    TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  fbc          TEXT,
  fbp          TEXT,
  ip           TEXT,
  ua           TEXT,
  source_url   TEXT,
  gclid        TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_content  TEXT,
  joined_at    INTEGER,
  joined_user  TEXT,
  capi_status  TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invites_link ON invites(invite_link);
CREATE INDEX IF NOT EXISTS idx_invites_click ON invites(click_key, category);

-- Toda entrada/saída vista no grupo (por qualquer link). user_hash é um HMAC
-- do id do Telegram: serve pra não contar a mesma pessoa duas vezes sem
-- guardar quem ela é (nada de nome, @usuário ou id puro).
CREATE TABLE IF NOT EXISTS member_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id   INTEGER UNIQUE,
  chat_id     TEXT NOT NULL,
  category    TEXT NOT NULL,
  kind        TEXT NOT NULL,   -- 'join' | 'leave'
  at          INTEGER NOT NULL,
  user_hash   TEXT,
  via         TEXT NOT NULL,   -- 'site_link' | 'other_link' | 'join_request' | 'unknown' | 'n/a'
  invite_name TEXT,
  invite_id   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_cat ON member_events(category, at);
`;

const nz = (v) => (v === undefined ? null : v);

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const q = {
    getKv: db.prepare('SELECT v FROM kv WHERE k = $k'),
    setKv: db.prepare('INSERT INTO kv (k, v) VALUES ($k, $v) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),

    insertInvite: db.prepare(`
      INSERT INTO invites (category, chat_id, name, invite_link, click_key, created_at, expires_at,
                           fbc, fbp, ip, ua, source_url, gclid, utm_source, utm_medium, utm_campaign, utm_content)
      VALUES ($category, $chat_id, $name, $invite_link, $click_key, $created_at, $expires_at,
              $fbc, $fbp, $ip, $ua, $source_url, $gclid, $utm_source, $utm_medium, $utm_campaign, $utm_content)`),
    findInvite: db.prepare(
      'SELECT * FROM invites WHERE chat_id = $chat_id AND (invite_link = $link OR name = $name) LIMIT 1'
    ),
    findReusable: db.prepare(`
      SELECT * FROM invites
      WHERE category = $category AND click_key = $click_key AND joined_at IS NULL AND revoked = 0
        AND created_at >= $min_created AND expires_at > $now
      ORDER BY id DESC LIMIT 1`),
    markJoined: db.prepare('UPDATE invites SET joined_at = $at, joined_user = $user WHERE id = $id'),
    setCapi: db.prepare('UPDATE invites SET capi_status = $status WHERE id = $id'),
    getInvite: db.prepare('SELECT * FROM invites WHERE id = $id'),
    pendingCapi: db.prepare(`
      SELECT * FROM invites
      WHERE joined_at IS NOT NULL AND joined_at >= $since
        AND (capi_status IS NULL OR capi_status LIKE 'error%')
      ORDER BY id LIMIT $limit`),

    insertEvent: db.prepare(`
      INSERT OR IGNORE INTO member_events (update_id, chat_id, category, kind, at, user_hash, via, invite_name, invite_id)
      VALUES ($update_id, $chat_id, $category, $kind, $at, $user_hash, $via, $invite_name, $invite_id)`),
    eventsSince: db.prepare('SELECT kind, at, via FROM member_events WHERE category = $category AND at >= $since ORDER BY at'),
    invitesSince: db.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(joined_at IS NOT NULL), 0) AS joined,
             COALESCE(SUM(capi_status = 'sent'), 0) AS capi_sent
      FROM invites WHERE category = $category AND created_at >= $since`),
    joinedBySource: db.prepare(`
      SELECT COALESCE(NULLIF(utm_source, ''), '(sem origem)') AS src, COUNT(*) AS n
      FROM invites WHERE category = $category AND joined_at >= $since
      GROUP BY src ORDER BY n DESC`),

    cleanupCandidates: db.prepare(`
      SELECT id, chat_id, invite_link FROM invites
      WHERE revoked = 0 AND (joined_at IS NOT NULL OR expires_at < $now)
      ORDER BY id LIMIT $limit`),
    markRevoked: db.prepare('UPDATE invites SET revoked = 1 WHERE id = $id'),
    purgePersonal: db.prepare(`
      UPDATE invites SET ip = NULL, ua = NULL, fbc = NULL, fbp = NULL, gclid = NULL, source_url = NULL
      WHERE created_at < $before
        AND (ip IS NOT NULL OR ua IS NOT NULL OR fbc IS NOT NULL OR fbp IS NOT NULL
             OR gclid IS NOT NULL OR source_url IS NOT NULL)`),
  };

  return {
    getKv: (k) => q.getKv.get({ $k: k })?.v ?? null,
    setKv: (k, v) => q.setKv.run({ $k: k, $v: String(v) }),

    insertInvite(i) {
      const r = q.insertInvite.run({
        $category: i.category,
        $chat_id: i.chat_id,
        $name: i.name,
        $invite_link: i.invite_link,
        $click_key: nz(i.click_key),
        $created_at: i.created_at,
        $expires_at: i.expires_at,
        $fbc: nz(i.fbc),
        $fbp: nz(i.fbp),
        $ip: nz(i.ip),
        $ua: nz(i.ua),
        $source_url: nz(i.source_url),
        $gclid: nz(i.gclid),
        $utm_source: nz(i.utm_source),
        $utm_medium: nz(i.utm_medium),
        $utm_campaign: nz(i.utm_campaign),
        $utm_content: nz(i.utm_content),
      });
      return Number(r.lastInsertRowid);
    },
    findInvite: (chatId, link, name) =>
      q.findInvite.get({ $chat_id: String(chatId), $link: nz(link), $name: nz(name) }) || null,
    findReusableInvite: (clickKey, category, minCreated, now) =>
      q.findReusable.get({ $category: category, $click_key: clickKey, $min_created: minCreated, $now: now }) || null,
    getInvite: (id) => q.getInvite.get({ $id: id }) || null,
    markJoined: (id, user, at) => q.markJoined.run({ $id: id, $user: user, $at: at }),
    setCapiStatus: (id, status) => q.setCapi.run({ $id: id, $status: status }),
    pendingCapi: (since, limit = 20) => q.pendingCapi.all({ $since: since, $limit: limit }),

    // true se gravou; false se esse update_id já tinha sido processado.
    insertMemberEvent(e) {
      const r = q.insertEvent.run({
        $update_id: nz(e.update_id),
        $chat_id: String(e.chat_id),
        $category: e.category,
        $kind: e.kind,
        $at: e.at,
        $user_hash: nz(e.user_hash),
        $via: e.via,
        $invite_name: nz(e.invite_name),
        $invite_id: nz(e.invite_id),
      });
      return r.changes === 1;
    },
    eventsSince: (category, since) => q.eventsSince.all({ $category: category, $since: since }),
    invitesSince: (category, since) => q.invitesSince.get({ $category: category, $since: since }),
    joinedBySource: (category, since) => q.joinedBySource.all({ $category: category, $since: since }),

    cleanupCandidates: (now, limit) => q.cleanupCandidates.all({ $now: now, $limit: limit }),
    markRevoked: (id) => q.markRevoked.run({ $id: id }),
    purgePersonalData: (before) => Number(q.purgePersonal.run({ $before: before }).changes),

    close: () => db.close(),
  };
}

module.exports = { openDb };
