#!/bin/sh
# Roda automaticamente no start do container (ver Dockerfile).
# Troca os placeholders ${LINK_...} do config.template.js pelos valores
# reais das variáveis de ambiente do container, gerando o config.js
# que o index.html carrega antes do script.js.
set -eu

# Valores padrão ("#") caso a variável não tenha sido setada no
# Portainer/docker-compose — assim o link só fica "morto", nunca quebrado
# com o texto literal "${LINK_...}" aparecendo na página.
: "${LINK_CASA:=#}"
: "${LINK_INFORMATICA:=#}"
: "${LINK_GAMES:=#}"
: "${LINK_IMPRESSAO3D:=#}"

# Tracking: fica vazio ("") se a env var não for setada — o site trata
# string vazia como "tracking desligado" (ver index.html / script.js).
: "${META_PIXEL_ID:=}"
: "${GOOGLE_ADS_ID:=}"
: "${GOOGLE_ADS_LABEL:=}"

export LINK_CASA LINK_INFORMATICA LINK_GAMES LINK_IMPRESSAO3D
export META_PIXEL_ID GOOGLE_ADS_ID GOOGLE_ADS_LABEL

envsubst '${LINK_CASA} ${LINK_INFORMATICA} ${LINK_GAMES} ${LINK_IMPRESSAO3D} ${META_PIXEL_ID} ${GOOGLE_ADS_ID} ${GOOGLE_ADS_LABEL}' \
  < /usr/share/nginx/html/config.template.js \
  > /usr/share/nginx/html/config.js

echo "[40-inject-env] config.js gerado com os links dos grupos."
