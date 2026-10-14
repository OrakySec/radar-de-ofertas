#!/usr/bin/env node
/**
 * Gera as páginas de nicho (uma por grupo) a partir do index.html:
 *
 *   casa.html  informatica.html  games.html  impressao-3d.html
 *
 * Servidas como /casa, /informatica, /games e /impressao-3d (ver
 * docker/nginx.conf). Pensadas pra receber o tráfego dos anúncios de
 * cada nicho, sem a distração dos outros grupos.
 *
 * O que é REAPROVEITADO do index.html (pra nunca ficar fora de sincronia
 * com o site principal):
 *   - os 7 cards de oferta de cada categoria
 *   - o bloco de tracking do <head> (config.js + Meta Pixel + Google Ads)
 *
 * Uso (sem dependências, só Node):
 *   node scripts/build-niches.js
 *
 * Rode de novo sempre que mudar as ofertas no index.html ou o texto
 * das páginas abaixo, e commite os .html gerados junto.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://rdo.ykaromarques.com';

const indexHtml = fs
  .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------
// Conteúdo de cada nicho. Os textos são HTML (use &amp; no lugar de &).
// `id` é o mesmo id de seção do index.html e a chave do script.js
// (eventos de tracking, contador de vagas, link do grupo).
// ---------------------------------------------------------------------
const NICHES = [
  {
    id: 'casa',
    accent: 'green',
    icon: '🏠',
    name: 'Casa &amp; Eletrodomésticos',
    short: 'Casa &amp; Eletro',
    title: 'Grupo de Ofertas de Casa e Eletrodomésticos | Radar de Ofertas',
    metaDesc:
      'Entre grátis no grupo de ofertas de Casa e Eletrodomésticos: air fryer, Smart TV, aspirador robô e muito mais com desconto, todo dia no seu celular.',
    h1: 'Ofertas de Casa e Eletrodomésticos',
    sub: 'Air fryer, Smart TV, aspirador robô, cafeteira e muito mais. Entre grátis no grupo e receba as melhores promoções todo dia — sem enrolação e sem spam.',
    cta: 'Entrar no grupo de Casa &amp; Eletro →',
    chips: [
      'Smart TVs', 'Air fryers', 'Aspiradores robô', 'Cafeteiras',
      'Smartwatches', 'Fones e caixas de som', 'Eletroportáteis', 'Utilidades pra casa',
    ],
    step2: 'As promoções de casa e eletrodomésticos chegam direto no seu',
    faqTypes:
      'Smart TVs, air fryers, aspiradores robô, cafeteiras, eletroportáteis, fones, caixas de som e utilidades pra casa — sempre com desconto.',
    finalTitle: 'Bora economizar na sua casa?',
  },
  {
    id: 'informatica',
    accent: 'cyan',
    icon: '🖥️',
    name: 'PC &amp; Informática',
    short: 'PC &amp; Informática',
    title: 'Grupo de Ofertas de PC e Informática | Radar de Ofertas',
    metaDesc:
      'Entre grátis no grupo de ofertas de PC e Informática: placa de vídeo, processador, SSD, monitor e periféricos com desconto, todo dia no seu celular.',
    h1: 'Ofertas de PC e Informática',
    sub: 'Placa de vídeo, processador, SSD, monitor, teclado e muito mais. Entre grátis no grupo e receba as melhores promoções de hardware todo dia — sem enrolação e sem spam.',
    cta: 'Entrar no grupo de Informática →',
    chips: [
      'Placas de vídeo', 'Processadores', 'SSDs e HDs', 'Memórias RAM',
      'Placas-mãe', 'Monitores gamer', 'Teclados e mouses', 'Headsets',
    ],
    step2: 'As promoções de PC e informática chegam direto no seu',
    faqTypes:
      'Placas de vídeo, processadores, memórias, SSDs, placas-mãe, monitores e periféricos (teclado, mouse, headset) — sempre com desconto.',
    finalTitle: 'Bora montar (ou melhorar) seu PC gastando menos?',
  },
  {
    id: 'games',
    accent: 'purple',
    icon: '🎮',
    name: 'Games PS5 &amp; Xbox',
    short: 'Games',
    title: 'Grupo de Ofertas de Games PS5 e Xbox | Radar de Ofertas',
    metaDesc:
      'Entre grátis no grupo de promoções de Games PS5 e Xbox: jogos, controles, headsets e acessórios com desconto, todo dia no seu celular.',
    h1: 'Promoções de Games PS5 e Xbox',
    sub: 'Jogos, controles, headsets e acessórios com desconto de verdade. Entre grátis no grupo e receba as melhores promoções todo dia — sem enrolação e sem spam.',
    cta: 'Entrar no grupo de Games →',
    chips: [
      'Jogos de PS5', 'Jogos de Xbox', 'Controles', 'Headsets',
      'Assinaturas e cartões', 'Acessórios', 'Lançamentos em promoção',
    ],
    step2: 'As promoções de games chegam direto no seu',
    faqTypes:
      'Jogos de PS5 e Xbox, controles, headsets, assinaturas, cartões e acessórios — sempre com desconto.',
    finalTitle: 'Bora jogar gastando menos?',
  },
  {
    id: 'impressao-3d',
    accent: 'orange',
    icon: '🖨️',
    name: 'Impressão 3D',
    short: 'Impressão 3D',
    title: 'Grupo de Ofertas de Impressão 3D | Radar de Ofertas',
    metaDesc:
      'Entre grátis no grupo de ofertas de Impressão 3D: impressoras, filamentos, resina e acessórios com desconto, todo dia no seu celular.',
    h1: 'Ofertas de Impressão 3D',
    sub: 'Impressoras, filamentos, resina e acessórios com os melhores preços. Entre grátis no grupo e receba as promoções todo dia — sem enrolação e sem spam.',
    cta: 'Entrar no grupo de Impressão 3D →',
    chips: [
      'Impressoras 3D FDM', 'Impressoras de resina', 'Filamentos PLA e PETG',
      'Bicos e hotends', 'Mesas e bases PEI', 'Peças de reposição', 'Acessórios e ferramentas',
    ],
    step2: 'As promoções de impressão 3D chegam direto no seu',
    faqTypes:
      'Impressoras 3D (FDM e resina), filamentos, bicos, mesas, peças de reposição e acessórios — sempre com desconto.',
    finalTitle: 'Bora imprimir mais gastando menos?',
  },
];

// ---------------------------------------------------------------------
// Extração do que vem do index.html
// ---------------------------------------------------------------------
function extractOfferCards(sectionId) {
  const re = new RegExp(
    `<section id="${sectionId}"[\\s\\S]*?<div class="carousel">\\n([\\s\\S]*?)\\n\\s*</div>\\s*</div>\\s*</section>`
  );
  const m = indexHtml.match(re);
  if (!m) throw new Error(`Não achei o carrossel da seção #${sectionId} no index.html`);
  const html = m[1].replace(/src="assets\//g, 'src="/assets/');
  const count = (html.match(/<article class="offer-card">/g) || []).length;
  if (count < 1) throw new Error(`Seção #${sectionId}: nenhum card de oferta encontrado`);
  return { html, count };
}

function extractTrackingHead() {
  const start = indexHtml.indexOf('<!-- Gerado a partir de config.template.js');
  const endMarker = '<!-- End Google Ads -->';
  const end = indexHtml.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error('Não achei o bloco de tracking (config.js + Pixel + Google Ads) no <head> do index.html');
  }
  return indexHtml
    .slice(start, end + endMarker.length)
    .replace('src="config.js"', 'src="/config.js"');
}

const TRACKING_HEAD = extractTrackingHead();

// ---------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------
const LOGO_SVG = `<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#22d3ee"/>
          <stop offset="1" stop-color="#34d399"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#logoGrad)" stroke-width="2" opacity=".35"/>
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#logoGrad)" stroke-width="2" opacity=".65"/>
      <circle cx="16" cy="16" r="4" fill="url(#logoGrad)"/>
    </svg>`;

function renderPage(n) {
  const { html: cards, count } = extractOfferCards(n.id);
  const url = `${SITE_URL}/${n.id}`;
  const chips = n.chips.map((c) => `<li class="chip">${c}</li>`).join('\n        ');
  const otherLinks = NICHES.filter((o) => o.id !== n.id)
    .map((o) => `<a href="/${o.id}">${o.short}</a>`)
    .join('\n    ');
  const channel = '<span data-channel>WhatsApp</span>';

  return `<!doctype html>
<!-- GERADO por scripts/build-niches.js — não edite à mão (rode o script de novo). -->
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${n.title}</title>
<meta name="description" content="${n.metaDesc}">
<meta name="theme-color" content="#0b0e12">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Radar de Ofertas">
<meta property="og:title" content="${n.title}">
<meta property="og:description" content="${n.metaDesc}">
<meta property="og:url" content="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=5">
<link rel="stylesheet" href="/niche.css?v=1">

<!-- Diz pro script.js qual é o nicho desta página: os pop-ups de "entrou no
     grupo" e o contador de vagas passam a falar só dele. -->
<script>window.RADAR_NICHE = '${n.id}';</script>

${TRACKING_HEAD}
</head>
<body>

<header class="site-header">
  <a href="/" class="logo" aria-label="Radar de Ofertas — página inicial">
    ${LOGO_SVG}
    <span>Radar</span> de Ofertas
  </a>
  <nav class="quick-nav">
    <a href="#ofertas">Ofertas</a>
    <a href="#como-funciona">Como funciona</a>
    <a href="#faq">Dúvidas</a>
    <a href="/" class="nav-hub">Todos os grupos →</a>
  </nav>
</header>

<!-- O id da <main> é o mesmo do nicho: é por ele que o script.js liga todos os
     botões "Entrar no grupo" desta página ao link certo (variável de ambiente)
     e dispara os eventos de tracking da categoria. -->
<main id="${n.id}" data-accent="${n.accent}">

  <!-- ===================== HERO ===================== -->
  <section class="niche-hero">
    <div class="niche-glow" aria-hidden="true"></div>
    <div class="niche-hero-inner">
      <div class="category-kicker">
        <span class="category-icon">${n.icon}</span>
        <p class="eyebrow">${n.name}</p>
      </div>
      <h1>${n.h1} <span class="hl">direto no seu ${channel}</span></h1>
      <p class="hero-sub">${n.sub}</p>

      <div class="niche-cta-wrap">
        <!-- TODO: o href é preenchido pelo script.js a partir do config.js (env var do Portainer) -->
        <a href="#" class="cta-button niche-cta">${n.cta}</a>
        <p class="vagas-counter" data-category="${n.id}">⚡ Restam <strong class="vagas-num">--</strong> vagas hoje</p>
        <p class="niche-microcopy">Sem cadastro • Entre e saia quando quiser</p>
      </div>

      <div class="hero-stats">
        <div><strong>100%</strong><span>grátis, sempre</span></div>
        <div><strong>Todo dia</strong><span>ofertas novas</span></div>
        <div><strong>Sem spam</strong><span>só oferta boa</span></div>
      </div>
    </div>
  </section>

  <!-- ===================== OFERTAS ===================== -->
  <section id="ofertas" class="niche-section alt">
    <div class="niche-section-head">
      <h2>Ofertas como essas, todo dia no grupo</h2>
      <p>Exemplos do tipo de promoção que você recebe. Entre no grupo pra ver as próximas assim que aparecerem.</p>
    </div>

    <div class="offers-wrap">
      <div class="offers-head">
        <h3>Ofertas recentes</h3>
        <button class="carousel-btn prev" aria-label="Anterior">‹</button>
        <button class="carousel-btn next" aria-label="Próximo">›</button>
      </div>
      <div class="carousel">
${cards}
      </div>
    </div>
  </section>

  <!-- ===================== O QUE TEM NO GRUPO ===================== -->
  <section class="niche-section">
    <div class="niche-section-head">
      <h2>O que você encontra no grupo</h2>
    </div>
    <ul class="chips">
        ${chips}
    </ul>
  </section>

  <!-- ===================== COMO FUNCIONA ===================== -->
  <section id="como-funciona" class="niche-section alt">
    <div class="niche-section-head">
      <h2>Como funciona</h2>
      <p>Três passos, menos de um minuto.</p>
    </div>
    <div class="steps">
      <div class="step">
        <span class="step-num">1</span>
        <h3>Clique em entrar</h3>
        <p>Um toque no botão e você já está dentro do grupo — sem cadastro, sem formulário.</p>
      </div>
      <div class="step">
        <span class="step-num">2</span>
        <h3>Receba as ofertas</h3>
        <p>${n.step2} ${channel}, assim que são encontradas.</p>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <h3>Escolha e economize</h3>
        <p>Viu algo que quer? Toque na oferta e compre direto na loja, pelo preço promocional.</p>
      </div>
    </div>
  </section>

  <!-- ===================== CTA FINAL ===================== -->
  <section class="niche-section">
    <div class="niche-final">
      <h2>${n.finalTitle}</h2>
      <p>Entre agora no grupo, é grátis — e as próximas ofertas já chegam no seu celular.</p>
      <a href="#" class="cta-button niche-cta">${n.cta}</a>
      <p class="vagas-counter" data-category="${n.id}">⚡ Restam <strong class="vagas-num">--</strong> vagas hoje</p>
    </div>
  </section>

  <!-- ===================== FAQ ===================== -->
  <section id="faq" class="faq">
    <h2>Perguntas rápidas</h2>
    <div class="faq-grid">
      <div class="faq-item">
        <h4>É grátis entrar no grupo?</h4>
        <p>Sim, 100% grátis, sem taxa nenhuma. Você só entra e começa a receber as ofertas.</p>
      </div>
      <div class="faq-item">
        <h4>Vou receber spam?</h4>
        <p>Não. Só ofertas selecionadas de ${n.name} — sem corrente, sem mensagem de terceiros.</p>
      </div>
      <div class="faq-item">
        <h4>Que tipo de oferta eu recebo?</h4>
        <p>${n.faqTypes}</p>
      </div>
      <div class="faq-item">
        <h4>Como as ofertas são escolhidas?</h4>
        <p>Comparamos preços entre as principais lojas e só enviamos quando o desconto realmente vale a pena.</p>
      </div>
      <div class="faq-item">
        <h4>Posso sair quando quiser?</h4>
        <p>Pode, a qualquer momento. É só sair do grupo — sem burocracia.</p>
      </div>
      <div class="faq-item">
        <h4>Posso entrar nos outros grupos também?</h4>
        <p>Pode sim! Temos grupos de Casa, Informática, Games e Impressão 3D — <a class="text-link" href="/">veja todos</a>.</p>
      </div>
    </div>
  </section>

</main>

<footer class="site-footer">
  <div class="footer-logo">
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#logoGrad)" stroke-width="2" opacity=".35"/>
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#logoGrad)" stroke-width="2" opacity=".65"/>
      <circle cx="16" cy="16" r="4" fill="url(#logoGrad)"/>
    </svg>
    <span>Radar</span> de Ofertas
  </div>
  <p>De impressão 3D a jogo novo, sempre tem uma promoção esperando por você.</p>
  <div class="footer-links">
    <a href="/">Todos os grupos</a>
    ${otherLinks}
  </div>
  <p class="disclaimer">Este site é independente e não possui vínculo com as marcas ou lojas citadas nas ofertas. Preços e disponibilidade podem mudar a qualquer momento.</p>
</footer>

<!-- Pop-ups de "fulano entrou no grupo agora" -->
<div id="toast-root" class="toast-root" aria-live="polite" aria-atomic="true"></div>

<script src="/script.js?v=8"></script>
<script src="/niche.js?v=2"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------
NICHES.forEach((n) => {
  const { count } = extractOfferCards(n.id);
  const file = path.join(ROOT, `${n.id}.html`);
  fs.writeFileSync(file, renderPage(n), 'utf8');
  console.log(`ok  ${n.id}.html  (${count} ofertas)  ->  ${SITE_URL}/${n.id}`);
});
