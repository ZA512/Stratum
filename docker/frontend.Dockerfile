# Frontend (Next.js) multi-stage build optimized for GHCR
# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Dependencies
# ============================================
FROM dhi.io/node:20-alpine3.22-dev AS deps
WORKDIR /app
USER root

# Install dependencies with cache mount
COPY package*.json ./
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages ./packages

RUN --mount=type=cache,target=/root/.npm ["npm","ci","--workspace","frontend","--include-workspace-root"]

# ============================================
# Stage 2: Builder
# ============================================
FROM dhi.io/node:20-alpine3.22-dev AS builder
WORKDIR /app
USER root

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

RUN ["npm","--workspace","frontend","run","build"]

# ============================================
# Stage 3: Production
# ============================================
FROM dhi.io/node:20-alpine3.22 AS prod

# OCI labels for GHCR
LABEL org.opencontainers.image.title="Stratum Frontend"
LABEL org.opencontainers.image.description="Next.js frontend for Stratum"
LABEL org.opencontainers.image.source="https://github.com/ZA512/Stratum"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

WORKDIR /app

# Copy only what's needed for production
COPY --chown=1000:1000 package*.json ./
COPY --chown=1000:1000 --from=deps /app/node_modules ./node_modules
COPY --chown=1000:1000 --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --chown=1000:1000 --from=builder /app/apps/frontend/public ./apps/frontend/public

USER 1000

WORKDIR /app/apps/frontend
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD ["node","-e","const http=require('http');const req=http.get('http://127.0.0.1:3000',res=>process.exit(res.statusCode&&res.statusCode<500?0:1));req.on('error',()=>process.exit(1));"]

CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
