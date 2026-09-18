# Step 1: base
FROM node:22-alpine3.20 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Step 2: dependencies
FROM base AS deps
# openssl: Prisma engine binaries. libc6-compat: glibc shim some native
# addons expect on musl/Alpine.
RUN apk add --no-cache openssl libc6-compat
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Step 3: build
FROM base AS builder
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm prisma generate

RUN --mount=type=cache,target=/app/.next/cache \
    SKIP_TYPECHECK=true NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

RUN pnpm prune --prod

# Step 4: runtime
FROM base AS runner

RUN apk add --no-cache ca-certificates curl openssl dumb-init

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./

USER nextjs

HEALTHCHECK --interval=10s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
