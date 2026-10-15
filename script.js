// Radar de Ofertas — liga os botões "Entrar no grupo" aos links reais,
// vindos de config.js (gerado a partir de variáveis de ambiente no
// container Docker — veja config.template.js e docker/40-inject-env.sh).
// Se config.js não existir (rodando local sem Docker) ou a env var de
// uma categoria não estiver setada, o link daquela categoria continua
// como está no HTML (href="#") — nunca quebra a página.
//
// Categorias com os DOIS canais configurados (window.RADAR_CHANNELS, hoje só
// a Impressão 3D) não vão direto pro link: o botão abre um modal pra pessoa
// escolher entre WhatsApp e Telegram. Com um canal só (ou só o link único
// antigo em RADAR_LINKS), segue indo direto, como sempre.
(function () {
  const links = (typeof window.RADAR_LINKS === 'object' && window.RADAR_LINKS) || {};
  const channels = (typeof window.RADAR_CHANNELS === 'object' && window.RADAR_CHANNELS) || {};

  // data-category das seções -> chave usada em config.template.js
  const SECTION_TO_KEY = {
    casa: 'casa',
    informatica: 'informatica',
    games: 'games',
    'impressao-3d': 'impressao3d',
  };

  // placeholder não preenchido (env var vazia) ou template não processado
  const isUrl = (u) => typeof u === 'string' && u !== '' && u !== '#' && !u.startsWith('${');

  Object.entries(SECTION_TO_KEY).forEach(([sectionId, key]) => {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const buttons = section.querySelectorAll('a.cta-button, a.offer-cta');
    const ch = channels[key] || {};
    const whatsapp = isUrl(ch.whatsapp) ? ch.whatsapp : null;
    const telegram = isUrl(ch.telegram) ? ch.telegram : null;

    // Os dois canais: abre o modal de escolha.
    if (whatsapp && telegram) {
      buttons.forEach((a) => {
        a.href = '#';
        a.setAttribute('role', 'button');
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openChannelChoice(key, { whatsapp, telegram }, a);
        });
      });
      return;
    }

    // Um canal só (ou o link único): vai direto pro grupo.
    const url = whatsapp || telegram || (isUrl(links[key]) ? links[key] : null);
    if (!url) return;

    buttons.forEach((a) => {
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', () => trackGroupClick(a.href, key));
    });
  });
})();

// =====================================================================
// Tracking: Meta Pixel (browser + CAPI via tracking-api) + Google Ads.
// Fica tudo "desligado" sozinho se as env vars de tracking não forem
// configuradas (ver config.template.js) — nunca quebra a página.
// =====================================================================
function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// _fbc só existe depois que o fbevents.js processa o fbclid da URL —
// no primeiro pageview vindo de um clique de anúncio ele pode não existir
// ainda, então construímos manualmente a partir do fbclid como fallback.
function getFbc() {
  const existing = getCookie('_fbc');
  if (existing) return existing;
  const fbclid = new URLSearchParams(window.location.search).get('fbclid');
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}

// Google Ads: UMA conversão por entrada no grupo. Fica fora do trackEvent de
// propósito — o trackEvent roda várias vezes por clique (JoinGroup,
// JoinGroup3D, CliqueWhatsApp...) e cada uma contaria como conversão.
function trackGoogleConversion(params) {
  const tracking = window.RADAR_TRACKING || {};
  const adsId = tracking.googleAdsId;
  const adsLabel = tracking.googleAdsLabel;
  if (typeof gtag === 'function' && adsId && adsLabel && adsId.indexOf('${') !== 0 && adsLabel.indexOf('${') !== 0) {
    gtag('event', 'conversion', { send_to: `${adsId}/${adsLabel}`, ...(params || {}) });
  }
}

// Meta: Pixel (navegador) + CAPI (servidor), com o MESMO eventId nos dois
// pra o Meta deduplicar.
function trackEvent(eventName, params) {
  const eventId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

  // 1. Pixel (navegador)
  if (typeof fbq === 'function') {
    fbq('trackCustom', eventName, params || {}, { eventID: eventId });
  }

  // 2. CAPI (servidor) — vai pro tracking-api, que repassa pro Graph API.
  //    Se o endpoint não existir/estiver fora do ar, falha em silêncio.
  fetch('/api/tracking/meta-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName,
      eventId,
      sourceUrl: window.location.href,
      userAgent: navigator.userAgent,
      fbc: getFbc(),
      fbp: getCookie('_fbp'),
    }),
  }).catch(() => {});
}

// Evento(s) de conversão "de entrada no grupo", por categoria. A
// Impressão 3D dispara os DOIS: o nome antigo (JoinGroup — mantém o
// histórico de otimização que já existia no /3d) e o novo (JoinGroup3D,
// pra dar pra medir/otimizar só a campanha de 3D separadamente). As
// outras 3 categorias continuam com um único evento próprio.
const JOIN_EVENTS_BY_CATEGORY = {
  casa: ['JoinGroupCasa'],
  informatica: ['JoinGroupInformatica'],
  games: ['JoinGroupGames'],
  impressao3d: ['JoinGroup', 'JoinGroup3D'],
};

// Entrada no grupo: eventos de conversão da categoria + o do canal, e UMA
// conversão no Google Ads. `channel` ('whatsapp' | 'telegram') vem explícito
// do modal; nos botões diretos ele é deduzido pela URL.
function trackGroupClick(url, category, channel) {
  const ch =
    channel ||
    (/t\.me|telegram/i.test(url) ? 'telegram' : /wa\.me|whatsapp/i.test(url) ? 'whatsapp' : null);
  const params = ch ? { category, channel: ch } : { category };

  const joinEvents = JOIN_EVENTS_BY_CATEGORY[category] || ['JoinGroup'];
  joinEvents.forEach((eventName) => trackEvent(eventName, params));

  if (ch === 'telegram') trackEvent('CliqueTelegram', params);
  else if (ch === 'whatsapp') trackEvent('CliqueWhatsApp', params);

  trackGoogleConversion(params);
}

// =====================================================================
// Modal de escolha de canal (WhatsApp ou Telegram).
//
// Mesmo fluxo do /3d: o clique no botão só ABRE o modal (evento
// CliqueGrupo); a entrada de verdade — JoinGroup + CliqueWhatsApp/
// CliqueTelegram + conversão do Google — conta quando a pessoa escolhe o
// canal. O modal é montado por aqui (nenhuma página precisa de markup).
// =====================================================================
const CHOICE_META = {
  casa: { label: 'Casa & Eletrodomésticos', accent: 'green' },
  informatica: { label: 'PC & Informática', accent: 'cyan' },
  games: { label: 'Games PS5 & Xbox', accent: 'purple' },
  impressao3d: { label: 'Impressão 3D', accent: 'orange' },
};

let channelModal = null;
let channelCtx = null;

function buildChannelModal() {
  if (channelModal) return channelModal;

  const el = document.createElement('div');
  el.className = 'choice-modal';
  el.hidden = true;
  el.innerHTML = `
    <div class="choice-backdrop" data-close></div>
    <div class="choice-card" role="dialog" aria-modal="true" aria-labelledby="choice-title">
      <button type="button" class="choice-close" aria-label="Fechar" data-close>&times;</button>
      <p class="choice-eyebrow"><span class="choice-group"></span></p>
      <h2 id="choice-title">Onde você quer entrar?</h2>
      <p class="choice-sub">Escolha o app da sua preferência. O grupo é o mesmo e é grátis.</p>
      <a class="choice-option choice-wa" data-via="whatsapp" target="_blank" rel="noopener noreferrer">
        <span class="choice-ico" aria-hidden="true">💬</span>
        <span class="choice-txt">Entrar pelo WhatsApp<small>Ofertas direto no seu WhatsApp</small></span>
      </a>
      <a class="choice-option choice-tg" data-via="telegram" target="_blank" rel="noopener noreferrer">
        <span class="choice-ico" aria-hidden="true">✈️</span>
        <span class="choice-txt">Entrar pelo Telegram<small>Ofertas direto no seu Telegram</small></span>
      </a>
      <p class="choice-micro">Sem cadastro • Entre e saia quando quiser</p>
    </div>`;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) {
      closeChannelChoice();
      return;
    }
    const opt = e.target.closest('a.choice-option');
    if (opt && channelCtx) {
      trackGroupClick(opt.href, channelCtx.category, opt.dataset.via);
      // deixa o navegador abrir a nova aba antes de fechar o modal
      setTimeout(closeChannelChoice, 0);
    }
  });

  document.body.appendChild(el);
  channelModal = el;
  return el;
}

function onChannelModalKeydown(e) {
  if (e.key === 'Escape') {
    closeChannelChoice();
    return;
  }
  if (e.key !== 'Tab' || !channelModal) return;

  // mantém o foco preso dentro do modal enquanto ele está aberto
  const focusable = channelModal.querySelectorAll('a.choice-option, button.choice-close');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function openChannelChoice(category, urls, trigger) {
  const el = buildChannelModal();
  channelCtx = { category, trigger };

  const meta = CHOICE_META[category] || { label: '', accent: 'cyan' };
  el.setAttribute('data-accent', meta.accent);
  el.querySelector('.choice-group').textContent = meta.label;
  el.querySelector('.choice-wa').href = urls.whatsapp;
  el.querySelector('.choice-tg').href = urls.telegram;

  el.hidden = false;
  document.documentElement.classList.add('choice-open');
  document.addEventListener('keydown', onChannelModalKeydown);
  el.querySelector('.choice-wa').focus();

  // O clique só abriu o modal: ainda não é uma entrada no grupo.
  trackEvent('CliqueGrupo', { category });
}

function closeChannelChoice() {
  if (!channelModal || channelModal.hidden) return;
  channelModal.hidden = true;
  document.documentElement.classList.remove('choice-open');
  document.removeEventListener('keydown', onChannelModalKeydown);
  if (channelCtx && channelCtx.trigger && typeof channelCtx.trigger.focus === 'function') {
    channelCtx.trigger.focus();
  }
  channelCtx = null;
}

// Radar de Ofertas — comportamento dos carrosséis de ofertas
document.querySelectorAll('.offers-wrap').forEach((wrap) => {
  const carousel = wrap.querySelector('.carousel');
  const prevBtn = wrap.querySelector('.carousel-btn.prev');
  const nextBtn = wrap.querySelector('.carousel-btn.next');
  if (!carousel || !prevBtn || !nextBtn) return;

  const scrollStep = () => {
    const card = carousel.querySelector('.offer-card');
    const gap = 16; // deve casar com o "gap" do .carousel no CSS
    return card ? card.offsetWidth + gap : 240;
  };

  prevBtn.addEventListener('click', () => {
    carousel.scrollBy({ left: -scrollStep() * 2, behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', () => {
    carousel.scrollBy({ left: scrollStep() * 2, behavior: 'smooth' });
  });
});


// =====================================================================
// Contador de "vagas" + pop-ups "fulano entrou no grupo agora"
// Os dois trabalham juntos: cada pop-up de entrada desconta 1 vaga.
//
// O contador persiste no localStorage do visitante e reseta sozinho a
// cada novo dia — assim ele não "zera" ao dar F5, mas também não fica
// preso no mesmo número pra sempre.
// =====================================================================
(function () {
  const CATEGORIES = [
    { id: 'casa',         label: 'Casa & Eletrodomésticos', accentVar: '--green'  },
    { id: 'informatica',  label: 'PC & Informática',        accentVar: '--cyan'   },
    { id: 'games',        label: 'Games PS5 & Xbox',        accentVar: '--purple' },
    { id: 'impressao-3d', label: 'Impressão 3D',            accentVar: '--orange' },
  ];

  const NAMES = [
    'Lucas M.', 'Ana P.', 'Rafael S.', 'Juliana C.', 'Pedro H.', 'Camila R.',
    'Bruno T.', 'Fernanda L.', 'Gabriel O.', 'Mariana F.', 'Thiago A.',
    'Beatriz N.', 'Diego K.', 'Larissa V.', 'Felipe B.', 'Amanda G.',
    'Rodrigo P.', 'Letícia S.', 'Matheus C.', 'Isabela D.',
  ];

  const CITIES = [
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba',
    'Porto Alegre', 'Salvador', 'Recife', 'Fortaleza', 'Brasília',
    'Campinas', 'Goiânia', 'Florianópolis',
  ];

  const STORAGE_KEY = 'radarOfertas.vagas.v1';
  const VAGAS_MIN_FLOOR = 4;      // nunca mostra menos que isso (senão parece esgotado)
  const VAGAS_RANGE = [18, 45];   // faixa de sorteio ao resetar o dia

  const todayKey = () => new Date().toISOString().slice(0, 10);

  function loadState() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { raw = null; }

    if (raw && raw.date === todayKey() && raw.values) return raw;

    // novo dia (ou primeira visita): sorteia vagas frescas por categoria
    const values = {};
    CATEGORIES.forEach((c) => {
      const [min, max] = VAGAS_RANGE;
      values[c.id] = Math.floor(min + Math.random() * (max - min));
    });
    const fresh = { date: todayKey(), values };
    saveState(fresh);
    return fresh;
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* localStorage indisponível — segue só em memória */ }
  }

  let state = loadState();

  function renderVagas(catId) {
    const val = state.values[catId];
    document.querySelectorAll(`.vagas-counter[data-category="${catId}"] .vagas-num`)
      .forEach((el) => {
        el.textContent = val;
        el.classList.remove('pulse');
        // força reflow pra poder tocar a animação de novo em sequência
        void el.offsetWidth;
        el.classList.add('pulse');
      });
  }

  function renderAllVagas() {
    CATEGORIES.forEach((c) => renderVagas(c.id));
  }

  function decrementVagas(catId) {
    const current = state.values[catId] ?? VAGAS_MIN_FLOOR;
    if (current > VAGAS_MIN_FLOOR) {
      state.values[catId] = current - 1;
      saveState(state);
    }
    renderVagas(catId);
  }

  function showToast(cat) {
    const root = document.getElementById('toast-root');
    if (!root) return;

    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.setProperty('--toast-accent', `var(${cat.accentVar})`);
    toast.innerHTML = `
      <span class="toast-avatar">${initials}</span>
      <span class="toast-text">
        <strong>${name}</strong> de ${city} entrou no grupo de ${cat.label} agora
        <span>há poucos segundos</span>
      </span>
    `;
    root.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  // Nas páginas de nicho (/casa, /games...), window.RADAR_NICHE diz qual é
  // o nicho da página: os pop-ups falam só dele (não faz sentido "entrou no
  // grupo de Games" na página de Casa) e vêm mais espaçados, porque aqui
  // todos caem na mesma categoria — no site principal eles se dividem
  // entre as 4. No site principal RADAR_NICHE não existe e nada muda.
  const NICHE_ID = window.RADAR_NICHE || null;
  const POOL = NICHE_ID ? CATEGORIES.filter((c) => c.id === NICHE_ID) : CATEGORIES;
  const ACTIVE = POOL.length ? POOL : CATEGORIES;
  const DELAY_FACTOR = NICHE_ID ? 3 : 1;

  function fireRandomJoin() {
    const cat = ACTIVE[Math.floor(Math.random() * ACTIVE.length)];
    showToast(cat);
    decrementVagas(cat.id);
  }

  function scheduleNext() {
    const delay = (9000 + Math.random() * 13000) * DELAY_FACTOR; // site: 9s–22s
    setTimeout(() => {
      fireRandomJoin();
      scheduleNext();
    }, delay);
  }

  renderAllVagas();
  // primeiro pop-up com um delay curto pra não "estourar" assim que a página abre
  setTimeout(fireRandomJoin, 3500);
  scheduleNext();
})();
