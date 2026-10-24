# syntax=docker/dockerfile:1
#
# Portal web (F8) compilado y servido por Caddy. Dos etapas: Node compila (`npm run build`) y en la imagen final solo
# quedan los ficheros estáticos y Caddy, sin Node ni node_modules.
#
#   docker build -t tfg/portal:local frontend/
#   docker run --rm -p 127.0.0.1:4173:8080 tfg/portal:local      → http://localhost:4173
#
# O con el resto de la plataforma: `docker compose --profile portal up -d --build` desde infra/.
# Para desarrollar sigue siendo más cómodo `npm run dev` (recarga al guardar).

FROM node:22.23.2-alpine AS compilacion
WORKDIR /portal
# primero las dependencias, para que la capa se reutilice mientras no cambie package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
 && node scripts/csp-caddy.mjs dist/index.html /portal/csp.caddy

FROM caddy:2.10.2-alpine
# Usuario sin privilegios. El binario de la imagen oficial lleva la capacidad de abrir puertos < 1024; aquí escucha en
# el 8080, así que se le quita: así arranca también con `cap_drop: [ALL]` y `no-new-privileges`.
RUN apk add --no-cache libcap \
 && setcap -r /usr/bin/caddy \
 && apk del libcap \
 && addgroup -S -g 10001 portal && adduser -S -u 10001 -G portal -H portal \
 && chown portal:portal /data /config
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=compilacion /portal/csp.caddy /etc/caddy/csp.caddy
COPY --from=compilacion /portal/dist /srv
USER portal
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
