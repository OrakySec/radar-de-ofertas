// Lê as variáveis de ambiente do serviço num objeto só.
//
// TELEGRAM_CHATS liga cada categoria do site ao grupo do Telegram dela:
//   TELEGRAM_CHATS="impressao3d:-1001234567890,games:-1009876543210"
// (as chaves são as mesmas do site: casa, informatica, games, impressao3d)

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// "impressao3d:-100123,games:-100456" -> Map { "-100123" => "impressao3d", ... }
function parseChats(v) {
  const chats = new Map();
  for (const part of list(v)) {
    const i = part.indexOf(':');
    if (i < 1) continue;
    const category = part.slice(0, i).trim();
    const chatId = part.slice(i + 1).trim();
    if (category && chatId) chats.set(chatId, category);
  }
  return chats;
}

function loadConfig(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN || '';
  return {
    port: num(env.PORT, 3000),
    dbPath: env.DB_PATH || '/data/radar.db',
    meta: {
      pixelId: env.META_PIXEL_ID || '',
      token: env.META_CAPI_TOKEN || '',
      graphVersion: env.META_GRAPH_VERSION || 'v19.0',
      graphBase: env.META_GRAPH_BASE || 'https://graph.facebook.com',
      // Opcional: manda os eventos como "de teste" (aba Eventos de teste do
      // Events Manager) em vez de contar de verdade. Só pra validar.
      testEventCode: env.META_TEST_EVENT_CODE || '',
    },
    telegram: {
      token,
      apiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
      chats: parseChats(env.TELEGRAM_CHATS), // chatId -> categoria
      adminIds: new Set(list(env.TELEGRAM_ADMIN_IDS)),
      hashKey: env.TELEGRAM_HASH_KEY || token,
      linkTtlHours: num(env.TELEGRAM_LINK_TTL_HOURS, 24),
      pollTimeoutSec: num(env.TELEGRAM_POLL_TIMEOUT, 25),
      retentionDays: num(env.DATA_RETENTION_DAYS, 90),
      // Anti-abuso do endpoint que gera links: por visitante e global.
      rateIp: { max: num(env.LINK_RATE_PER_IP, 5), windowMs: 10 * 60 * 1000 },
      rateGlobal: { max: num(env.LINK_RATE_GLOBAL, 300), windowMs: 60 * 60 * 1000 },
    },
  };
}

module.exports = { loadConfig, parseChats };
