FROM oven/bun:1.3.10 AS dependencies

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:24-trixie-slim AS builder

WORKDIR /app
ENV DATABASE_PROVIDER=sqlite
ENV DATABASE_URL=:memory:
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_DATABASE_MIGRATIONS=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN node node_modules/next/dist/bin/next build

FROM node:24-trixie-slim AS runner

WORKDIR /app
ENV DATABASE_PROVIDER=sqlite
ENV DATABASE_URL=/app/data/sqlite.db
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV UPLOADS_DIR=/app/data/uploads

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs \
  && mkdir -p /app/data/uploads \
  && chown -R nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/knowledge ./knowledge
COPY --from=builder --chown=nextjs:nodejs /app/scripts/sync-writing-sources.mjs ./scripts/sync-writing-sources.mjs
COPY --from=builder --chown=nextjs:nodejs /app/docs/licenses ./licenses

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
