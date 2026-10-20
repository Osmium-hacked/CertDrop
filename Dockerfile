# One image, two processes. Run the API with the default command and the worker with
#   docker run <image> node dist/worker.js
# Or a single process doing both: RUN_WORKER_IN_API=true, started with `sh docker-start.sh`
# to apply migrations first (render.yaml does this on Render's free plan).

FROM node:24-slim AS base
# Prisma's query engine links against OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.34.7

# ---- build: install, bundle, then produce a pruned production-only copy of the API ----
FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The API's postinstall runs `prisma generate`, which needs the schema.
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter "@certdrop/api..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @certdrop/api build

# @certdrop/shared is a devDependency (tsup inlines it), so the pruned copy contains only real
# runtime packages.
RUN pnpm --filter @certdrop/api deploy --prod --legacy /out \
  && cp -r apps/api/dist apps/api/prisma apps/api/docker-start.sh /out/ \
  && cp -r packages/shared/fonts /out/fonts \
  && cd /out && node_modules/.bin/prisma generate

# ---- runtime ----
FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# The worker embeds these TTFs in every certificate.
ENV FONTS_DIR=/app/fonts
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 3000
CMD ["node", "dist/server.js"]
