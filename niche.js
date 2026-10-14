// Radar de Ofertas — páginas de nicho.
//
// Os textos "WhatsApp" das páginas são só o padrão: ajusta pro canal que a
// pessoa vai realmente encontrar ao clicar, a partir do que está configurado
// (variáveis de ambiente no Portainer -> config.js):
//   - os dois canais configurados (modal de escolha) -> "WhatsApp ou Telegram"
//   - só o Telegram                                   -> "Telegram"
//   - só o WhatsApp                                   -> "WhatsApp"
// Assim a página nunca promete um canal diferente do que está disponível.
(function () {
  const nicheId = window.RADAR_NICHE;
  const links = window.RADAR_LINKS || {};
  const channels = window.RADAR_CHANNELS || {};

  // id do nicho (seção) -> chave em config.template.js
  const key = nicheId === 'impressao-3d' ? 'impressao3d' : nicheId;

  const isUrl = (u) => typeof u === 'string' && u !== '' && u !== '#' && !u.startsWith('${');
  const ch = channels[key] || {};
  const hasWhatsapp = isUrl(ch.whatsapp);
  const hasTelegram = isUrl(ch.telegram);
  const single = typeof links[key] === 'string' ? links[key] : '';

  let label = 'WhatsApp';
  if (hasWhatsapp && hasTelegram) label = 'WhatsApp ou Telegram';
  else if (hasTelegram) label = 'Telegram';
  else if (hasWhatsapp) label = 'WhatsApp';
  else if (/t\.me|telegram/i.test(single)) label = 'Telegram';

  document.querySelectorAll('[data-channel]').forEach((el) => {
    el.textContent = label;
  });
})();
