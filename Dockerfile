# syntax=docker/dockerfile:1
# T-32: imagen de producción sin toolchain de dev.
# - El build de cada servicio (tsc + tsc-alias) ya emite un dist autocontenido:
#   compila las 6 libs del workspace dentro de dist/apps/<app>/libs y reescribe
#   los alias @org/* a rutas relativas → no se necesita ts-node/tsconfig-paths
#   en runtime.
# - node_modules de producción se instala en una etapa propia (npm ci --omit=dev)
#   y es lo único que llega a la imagen final junto con dist y prisma.

# ── Etapa pruner: solo los package.json de los workspaces ────────────────────
# npm ci (estricto) exige que todos los workspaces del lockfile existan en disco.
# Esta etapa extrae únicamente sus package.json para que las capas de instalación
# cacheen bien (solo se invalidan cuando cambia un manifest, no el código).
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS pruner
WORKDIR /usr/src/app
COPY apps ./apps
COPY libs ./libs
RUN mkdir /out && \
    find apps libs -mindepth 2 -maxdepth 2 -name package.json | \
    while read -r f; do mkdir -p "/out/$(dirname "$f")" && cp "$f" "/out/$f"; done

# ── Etapa builder: compila el servicio (con devDependencies) ─────────────────
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS builder
WORKDIR /usr/src/app

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY --from=pruner /out ./

# npm ci (no npm install): builds reproducibles alineados con el lockfile,
# igual que la CI.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache/node-gyp \
    apk add --no-cache python3 make g++ && \
    npm ci --ignore-scripts && \
    npm rebuild bcrypt --build-from-source

COPY libs/ ./libs/
COPY apps/${APP_NAME} ./apps/${APP_NAME}

# El cliente se genera en apps/<app>/src/generated y el build lo copia al dist.
RUN npx prisma generate --schema=./apps/${APP_NAME}/prisma/schema.prisma

RUN npx nx build ${APP_NAME} --configuration=production

# ── Etapa proddeps: node_modules solo de producción ──────────────────────────
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS proddeps
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY --from=pruner /out ./

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/root/.cache/node-gyp \
    apk add --no-cache python3 make g++ && \
    npm ci --omit=dev --ignore-scripts && \
    npm rebuild bcrypt --build-from-source && \
    # typescript llega como peer opcional de la CLI de Prisma (npm ci reifica el
    # lockfile e ignora --omit=peer); fuera de la imagen: no es toolchain de runtime.
    rm -rf node_modules/typescript node_modules/.bin/tsc node_modules/.bin/tsserver

# ── Etapa final: runtime mínimo (node + dist + deps de prod + prisma) ────────
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS production
WORKDIR /usr/src/app

ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production

COPY --chown=node:node --from=proddeps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist/apps/${APP_NAME} ./dist/apps/${APP_NAME}
# Migraciones versionadas + config para `prisma migrate deploy` del entrypoint.
COPY --chown=node:node --from=builder /usr/src/app/apps/${APP_NAME}/prisma ./apps/${APP_NAME}/prisma
COPY --chown=node:node --from=builder /usr/src/app/apps/${APP_NAME}/package.json ./apps/${APP_NAME}/package.json

COPY --chown=node:node infra/entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

# Punto de montaje de adjuntos (servicio-compras). Docker inicializa un volumen
# nombrado nuevo heredando el owner del directorio de la imagen; sin esto el
# volumen quedaría root y el proceso (USER node) no podría escribir.
RUN mkdir -p /data/comprobantes && chown -R node:node /data

USER node
EXPOSE 3000

CMD ["sh", "-c", "./entrypoint.sh"]
