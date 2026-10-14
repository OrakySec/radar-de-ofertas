# Node 22: tem o SQLite embutido (node:sqlite), então o banco do bot não
# precisa de nenhuma dependência nativa pra compilar.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src

# O banco do bot (SQLite) fica num volume, fora da imagem.
RUN mkdir -p /data && chown node:node /data
ENV DB_PATH=/data/radar.db
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/tracking/health >/dev/null || exit 1
CMD ["node", "server.js"]
