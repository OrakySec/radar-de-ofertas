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
    achadinhos: 'achadinhos',
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
  achadinhos: ['JoinGroupAchadinhos'],
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
  achadinhos: { label: 'Achadinhos', accent: 'pink' },
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
        <span class="choice-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></span>
        <span class="choice-txt">Entrar pelo WhatsApp<small>Ofertas direto no seu WhatsApp</small></span>
      </a>
      <a class="choice-option choice-tg" data-via="telegram" target="_blank" rel="noopener noreferrer">
        <span class="choice-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" focusable="false"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></span>
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
    { id: 'achadinhos',   label: 'Achadinhos',              accentVar: '--pink'   },
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
