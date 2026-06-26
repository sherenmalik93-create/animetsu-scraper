# syntax=docker/dockerfile:1.7

# ------------------------------------------------------------------
#  Stage 1 — install deps
# ------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Bun for installing (faster + deterministic lockfile)
RUN apk add --no-cache libc6-compat && \
    npm install -g bun

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ------------------------------------------------------------------
#  Stage 2 — build the Next.js standalone output
# ------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g bun

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Prisma client needs to be generated before build
RUN bun run db:generate || true

RUN bun run build

# ------------------------------------------------------------------
#  Stage 3 — minimal runtime image
# ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy standalone server + static assets + public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3000/api/scrape/recent?per_page=1" || exit 1

CMD ["node", "server.js"]
