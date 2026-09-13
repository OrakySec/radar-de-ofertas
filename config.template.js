// Template injetado no start do container (veja docker/40-inject-env.sh).
// Os valores ${LINK_...} são substituídos pelas variáveis de ambiente
// configuradas no Portainer/docker-compose e viram config.js real.
window.RADAR_LINKS = {
  casa: "${LINK_CASA}",
  informatica: "${LINK_INFORMATICA}",
  games: "${LINK_GAMES}",
  impressao3d: "${LINK_IMPRESSAO3D}"
};
