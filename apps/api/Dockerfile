# syntax=docker/dockerfile:1
# API image (ADR-018). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t slotly-api .
# Runs the app (`node dist/main.js`) or, as a separate step before a release, the
# migrations (`node dist/migrate.js`).


# Pinned by digest, like actions by SHA: a tag can be moved. Dependabot (docker) updates it
FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
# pnpm of the version in package.json "packageManager"; no git hooks in an image
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 HUSKY=0
RUN corepack enable
WORKDIR /repo
# Dependencies first: this layer is reused until the lockfile changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @slotly/api...
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter @slotly/api build
# Only production dependencies and the files listed in "files" (dist, drizzle)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @slotly/api deploy --prod /out

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runtime
# The app runs with node alone: package managers are attack surface and scanner findings
# (npm bundles its own undici, tar…), not features. Removed, not just unused
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    # A container accepts connections from outside it (ADR-016)
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app
# Owned by root, run as node: the process cannot change its own code
COPY --from=build /out ./
USER node
EXPOSE 4000
# Readiness: compose --wait and the smoke test wait for the database to answer too
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health/ready`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
