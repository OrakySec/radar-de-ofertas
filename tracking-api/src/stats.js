// Relatório de entradas do Telegram (resposta do comando /stats).

const LABELS = {
  casa: 'Casa & Eletrodomésticos',
  informatica: 'PC & Informática',
  games: 'Games PS5 & Xbox',
  impressao3d: 'Impressão 3D',
};

const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

function dayLabel(sec) {
  return new Date(sec * 1000).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });
}

function buildStats({ db, categories, days, nowSec }) {
  if (!categories.length) {
    return 'Nenhum grupo configurado ainda (variável TELEGRAM_CHATS).';
  }

  const since = nowSec - days * 86400;
  const blocks = categories.map((category) => {
    const events = db.eventsSince(category, since);
    const joins = events.filter((e) => e.kind === 'join');
    const leaves = events.filter((e) => e.kind === 'leave');
    const viaSite = joins.filter((e) => e.via === 'site_link').length;
    const links = db.invitesSince(category, since);
    const sources = db.joinedBySource(category, since);

    const perDay = new Map();
    for (const e of joins) {
      const d = dayLabel(e.at);
      perDay.set(d, (perDay.get(d) || 0) + 1);
    }
    const dayLine = [...perDay.entries()]
      .reverse()
      .slice(0, 10)
      .map(([d, n]) => `${d}: ${n}`)
      .join(' · ');

    const lines = [
      `📊 ${LABELS[category] || category} — últimos ${days} dia(s)`,
      `Entradas: ${joins.length} · Saídas: ${leaves.length} · Saldo: ${joins.length - leaves.length >= 0 ? '+' : ''}${joins.length - leaves.length}`,
      `• pelo link do site (com origem): ${viaSite} (${pct(viaSite, joins.length)}%)`,
      `• por outros links/pesquisa: ${joins.length - viaSite}`,
      `Links gerados no site: ${links.total} → entraram: ${links.joined} (${pct(links.joined, links.total)}%)`,
      `Enviadas ao Meta: ${links.capi_sent}`,
    ];
    if (sources.length) lines.push(`Por origem: ${sources.map((s) => `${s.src} ${s.n}`).join(' · ')}`);
    if (dayLine) lines.push(`Por dia: ${dayLine}`);
    return lines.join('\n');
  });

  return blocks.join('\n\n');
}

module.exports = { buildStats, LABELS };
