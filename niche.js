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
  let icon = 'whatsapp';
  if (hasWhatsapp && hasTelegram) { label = 'WhatsApp ou Telegram'; icon = null; }
  else if (hasTelegram) { label = 'Telegram'; icon = 'telegram'; }
  else if (hasWhatsapp) { label = 'WhatsApp'; icon = 'whatsapp'; }
  else if (/t\.me|telegram/i.test(single)) { label = 'Telegram'; icon = 'telegram'; }

  document.querySelectorAll('[data-channel]').forEach((el) => {
    el.textContent = label;
  });

  // Logo do app dentro dos botões "Entrar no grupo": a pessoa reconhece na
  // hora pra onde o clique leva. Com os dois canais (modal), fica sem logo.
  const svgs = window.RADAR_CHANNEL_SVG || {};
  if (icon && svgs[icon]) {
    document.querySelectorAll('main .niche-cta').forEach((a) => {
      const span = document.createElement('span');
      span.className = 'cta-ico';
      span.setAttribute('aria-hidden', 'true');
      span.innerHTML = svgs[icon];
      a.prepend(span);
    });
  }
})();

// Botão "Entrar no grupo" fixo no rodapé (só no celular, via CSS): aparece
// quando o botão do hero sai da tela e some quando o CTA final está visível,
// pra nunca ter dois botões iguais na tela ao mesmo tempo.
(function () {
  const bar = document.querySelector('.sticky-cta');
  const hero = document.querySelector('.niche-hero .niche-cta');
  const final = document.querySelector('.niche-final');
  if (!bar || !hero || !('IntersectionObserver' in window)) return;

  const visible = new Set();
  const update = () => {
    const show = !visible.has(hero) && !visible.has(final);
    document.body.classList.toggle('sticky-on', show);
    bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    bar.querySelector('a').tabIndex = show ? 0 : -1;
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) visible.add(e.target);
      else visible.delete(e.target);
    });
    update();
  });
  io.observe(hero);
  if (final) io.observe(final);
})();
