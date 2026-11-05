# syntax=docker/dockerfile:1
# Build a partir da raiz do monorepo:
#   docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
# openssl é usado pelo motor de migrations do Prisma.
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo
# prisma.config.ts lê DATABASE_URL; para gerar o cliente basta um valor qualquer.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    CI=true
# Store do pnpm em cache entre builds; poucos downloads simultâneos e
# preferência pelo que já está no cache deixam o build estável em redes lentas.
ENV PNPM_FLAGS="--frozen-lockfile --filter api --store-dir /pnpm/store --prefer-offline --network-concurrency 8"

# Só os manifestos: a camada de dependências só é refeita quando eles mudam.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/

# Dependências completas, sem scripts (o prisma generate roda depois, com o
# schema já copiado; assim mudar o schema não refaz a instalação).
FROM manifests AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install $PNPM_FLAGS --ignore-scripts
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api build

# Só as dependências de produção (o Prisma CLI está nelas, para as migrations).
# Roda depois do build (COPY abaixo) para reaproveitar o cache já preenchido
# em vez de disputar a rede com ele. Aqui os scripts rodam: o Prisma baixa o
# motor de migrations; o schema é copiado só para o postinstall funcionar.
FROM manifests AS prod-deps
COPY --from=build /repo/apps/api/package.json /tmp/depois-do-build
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install $PNPM_FLAGS --prod

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /repo /repo
COPY --from=build --chown=node:node /repo/apps/api/dist /repo/apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/api/health/live || exit 1
# Aplica as migrations pendentes antes de subir (seguro rodar toda vez:
# migrate deploy só aplica o que falta e nunca apaga dados).
# Se SEED_ADMIN_EMAIL estiver definido (ex.: demonstração no Render, sem
# terminal), cria o administrador; o script é idempotente e uma falha nele
# não impede a API de subir.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && { [ -z \"$SEED_ADMIN_EMAIL\" ] || node dist/scripts/create-admin.js || echo 'aviso: create-admin falhou'; } && exec node dist/main.js"]
