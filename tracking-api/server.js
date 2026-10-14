// Radar de Ofertas — tracking-api
//
// 1) Recebe o POST que o script.js do site dispara a cada clique de "Entrar no
//    grupo" e repassa pra Meta Conversions API (server-side), com o MESMO
//    eventId do Pixel pra o Meta deduplicar.
// 2) Gera links de convite únicos do Telegram e, com um bot administrador do
//    grupo, conta quem entrou e de qual visita/anúncio veio (ver README.md).
//
// Nunca reutilize o token de outro projeto/pixel: gere um token novo em
// Meta Events Manager > Configurações de eventos > Conversions API.
const { buildApp } = require('./src/app');

const { app, cfg, bot, meta, close } = buildApp(process.env);

const server = app.listen(cfg.port, () => {
  console.log(`[radar-tracking-api] ouvindo na porta ${cfg.port}`);
  if (!meta.enabled) {
    console.warn('[radar-tracking-api] META_PIXEL_ID/META_CAPI_TOKEN não configurados — eventos serão ignorados (skipped).');
  }
  if (bot) {
    bot.start().catch((e) => console.error(`[radar-tracking-api] bot: ${e.message}`));
  } else {
    console.log('[radar-tracking-api] TELEGRAM_BOT_TOKEN não configurado — bot do Telegram desligado.');
  }
});

async function shutdown() {
  server.close();
  await close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
