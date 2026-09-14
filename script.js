// Radar de Ofertas — liga os botões "Entrar no grupo" aos links reais,
// vindos de config.js (gerado a partir de variáveis de ambiente no
// container Docker — veja config.template.js e docker/40-inject-env.sh).
// Se config.js não existir (rodando local sem Docker) ou a env var de
// uma categoria não estiver setada, o link daquela categoria continua
// como está no HTML (href="#") — nunca quebra a página.
(function () {
  const links = (typeof window.RADAR_LINKS === 'object' && window.RADAR_LINKS) || {};

  // data-category das seções -> chave usada em config.template.js
  const SECTION_TO_KEY = {
    casa: 'casa',
    informatica: 'informatica',
    games: 'games',
    'impressao-3d': 'impressao3d',
  };

  Object.entries(SECTION_TO_KEY).forEach(([sectionId, key]) => {
    const url = links[key];
    // placeholder não preenchido (env var vazia) ou template não processado
    if (!url || url.startsWith('${') || url === '#') return;

    const section = document.getElementById(sectionId);
    if (!section) return;

    section.querySelectorAll('a.cta-button, a.offer-cta').forEach((a) => {
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

function trackEvent(eventName, params) {
  const eventId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

  // 1. Pixel (navegador)
  if (typeof fbq === 'function') {
    fbq('trackCustom', eventName, params || {}, { eventID: eventId });
  }

  // 2. Google Ads — dispara a mesma conversão configurada, se houver.
  const tracking = window.RADAR_TRACKING || {};
  const adsId = tracking.googleAdsId;
  const adsLabel = tracking.googleAdsLabel;
  if (typeof gtag === 'function' && adsId && adsLabel && adsId.indexOf('${') !== 0 && adsLabel.indexOf('${') !== 0) {
    gtag('event', 'conversion', { send_to: `${adsId}/${adsLabel}`, ...(params || {}) });
  }

  // 3. CAPI (servidor) — vai pro tracking-api, que repassa pro Graph API.
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

function trackGroupClick(url, category) {
  const joinEvents = JOIN_EVENTS_BY_CATEGORY[category] || ['JoinGroup'];
  joinEvents.forEach((eventName) => trackEvent(eventName, { category }));

  if (/t\.me|telegram/i.test(url)) {
    trackEvent('CliqueTelegram', { category });
  } else if (/wa\.me|whatsapp/i.test(url)) {
    trackEvent('CliqueWhatsApp', { category });
  }
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

  function fireRandomJoin() {
    const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    showToast(cat);
    decrementVagas(cat.id);
  }

  function scheduleNext() {
    const delay = 9000 + Math.random() * 13000; // 9s–22s
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
