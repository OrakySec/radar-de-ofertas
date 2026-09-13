# Radar de Ofertas — site estático (HTML/CSS/JS) servido por nginx.
# Os links dos grupos (WhatsApp/Telegram) NÃO ficam hardcoded no HTML:
# são injetados em tempo de execução a partir de variáveis de ambiente,
# via config.template.js -> config.js (veja docker/40-inject-env.sh).

FROM nginx:alpine

# Site estático
COPY index.html styles.css script.js config.template.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

# Script que roda automaticamente no start do container: a imagem oficial
# do nginx executa qualquer *.sh executável em /docker-entrypoint.d/
# (em ordem alfabética) antes de subir o nginx.
COPY docker/40-inject-env.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh

EXPOSE 80
