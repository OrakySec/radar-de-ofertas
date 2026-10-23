// Template injetado no start do container (veja docker/40-inject-env.sh).
// Os valores ${...} são substituídos pelas variáveis de ambiente
// configuradas no Portainer/docker-compose e viram config.js real.
window.RADAR_LINKS = {
  casa: "${LINK_CASA}",
  informatica: "${LINK_INFORMATICA}",
  games: "${LINK_GAMES}",
  impressao3d: "${LINK_IMPRESSAO3D}",
  achadinhos: "${LINK_ACHADINHOS}"
};

// Categorias com os DOIS canais (hoje só a Impressão 3D): com WhatsApp e
// Telegram preenchidos, o botão "Entrar no grupo" abre um modal pra pessoa
// escolher. Se só um estiver preenchido, vai direto nele; se nenhum, cai no
// link único de RADAR_LINKS acima. Variável vazia = canal desligado.
window.RADAR_CHANNELS = {
  impressao3d: {
    whatsapp: "${LINK_IMPRESSAO3D_WHATSAPP}",
    telegram: "${LINK_IMPRESSAO3D_TELEGRAM}"
  }
};

// IDs de tracking (Meta Pixel / Google Ads). Deixe em branco na env var
// pra desativar aquele tracking sem precisar mexer em código.
window.RADAR_TRACKING = {
  metaPixelId: "${META_PIXEL_ID}",
  googleAdsId: "${GOOGLE_ADS_ID}",
  googleAdsLabel: "${GOOGLE_ADS_LABEL}"
};
