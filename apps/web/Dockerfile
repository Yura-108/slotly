# syntax=docker/dockerfile:1
# Web image (ADR-018). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t slotly-web .
# One image for every environment: the API address (API_INTERNAL_URL) is read at start.


# Pinned by digest, like actions by SHA: a tag can be moved. Dependabot (docker) updates it
FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 HUSKY=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @slotly/web...
COPY apps/web apps/web
COPY tsconfig.base.json ./
# output: 'standalone' — server.js with only the files it uses (next.config.ts)
RUN pnpm --filter @slotly/web build

FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
# Static assets are served by server.js but not traced into standalone
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
# A page that needs only the web server: its own health, not the API's
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/login`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
