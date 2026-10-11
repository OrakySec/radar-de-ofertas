// Radar de Ofertas — páginas de nicho.
//
// Os textos "WhatsApp" das páginas são só o padrão: se o link do grupo
// (variável de ambiente no Portainer -> config.js) for do Telegram, troca
// pra "Telegram" — assim a página nunca promete um canal diferente do
// que a pessoa vai realmente encontrar ao clicar.
(function () {
  const nicheId = window.RADAR_NICHE;
  const links = window.RADAR_LINKS || {};

  // id do nicho (seção) -> chave em config.template.js
  const key = nicheId === 'impressao-3d' ? 'impressao3d' : nicheId;
  const url = typeof links[key] === 'string' ? links[key] : '';

  let channel = 'WhatsApp';
  if (/t\.me|telegram/i.test(url)) channel = 'Telegram';

  document.querySelectorAll('[data-channel]').forEach((el) => {
    el.textContent = channel;
  });
})();
