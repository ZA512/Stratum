# Frontend (Next.js) multi-stage build optimized for GHCR
# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies with cache mount
COPY package*.json ./
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages ./packages

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace frontend --include-workspace-root

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# npm workspaces hoists dependencies to root node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY apps/frontend ./apps/frontend
COPY packages ./packages

# Build args for Next.js public environment variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/frontend
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS prod

# OCI labels for GHCR
LABEL org.opencontainers.image.title="Stratum Frontend"
LABEL org.opencontainers.image.description="Next.js frontend for Stratum"
LABEL org.opencontainers.image.source="https://github.com/ZA512/Stratum"
LABEL org.opencontainers.image.licenses="UNLICENSED"

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

WORKDIR /app

# Copy only what's needed for production
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public

# Set correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

WORKDIR /app/apps/frontend
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
