# Radar de Ofertas — site estático (HTML/CSS/JS) servido por nginx.
# Os links dos grupos (WhatsApp/Telegram) NÃO ficam hardcoded no HTML:
# são injetados em tempo de execução a partir de variáveis de ambiente,
# via config.template.js -> config.js (veja docker/40-inject-env.sh).

FROM nginx:alpine

# Site estático: página principal + páginas de nicho (geradas por
# scripts/build-niches.js: /casa, /informatica, /games, /impressao-3d)
COPY index.html styles.css script.js config.template.js /usr/share/nginx/html/
COPY niche.css niche.js /usr/share/nginx/html/
COPY casa.html informatica.html games.html impressao-3d.html /usr/share/nginx/html/
COPY favicon.svg favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

# URLs limpas (/casa em vez de /casa.html), redirect de /casa/ -> /casa e
# cache correto do config.js (ver docker/nginx.conf).
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Script que roda automaticamente no start do container: a imagem oficial
# do nginx executa qualquer *.sh executável em /docker-entrypoint.d/
# (em ordem alfabética) antes de subir o nginx.
COPY docker/40-inject-env.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh

EXPOSE 80
