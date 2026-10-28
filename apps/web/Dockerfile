# syntax=docker/dockerfile:1
# Build a partir da raiz do monorepo:
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
ENV CI=true NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter web \
      --store-dir /pnpm/store --prefer-offline --network-concurrency 8
COPY apps/web apps/web
RUN pnpm --filter web build

# O build "standalone" já traz só o necessário para rodar (sem node_modules
# completo). Os arquivos estáticos são copiados à parte, como manda o Next.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Ícones, service worker e página offline do app instalável.
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/login || exit 1
CMD ["node", "apps/web/server.js"]
