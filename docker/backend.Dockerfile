# Backend (NestJS) multi-stage build optimized for GHCR
# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Dependencies
# ============================================
FROM dhi.io/node:20-alpine3.22-dev AS deps
WORKDIR /app
USER root

# Install only production dependencies first for better caching
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma
COPY packages ./packages

# Use cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm ["npm","ci","--workspace","backend","--include-workspace-root"]

# ============================================
# Stage 2: Builder
# ============================================
FROM dhi.io/node:20-alpine3.22-dev AS builder
WORKDIR /app
USER root

# npm workspaces hoists dependencies to root node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY apps/backend ./apps/backend
COPY packages ./packages

# Generate Prisma client (avoid relying on /bin/sh)
RUN ["node","./node_modules/prisma/build/index.js","generate","--schema","./apps/backend/prisma/schema.prisma"]

# Build the application
RUN ["npm","--workspace","backend","run","build"]

# ============================================
# Stage 3: Production
# ============================================
FROM dhi.io/node:20-alpine3.22 AS prod

# OCI labels for GHCR
LABEL org.opencontainers.image.title="Stratum Backend"
LABEL org.opencontainers.image.description="NestJS backend API for Stratum"
LABEL org.opencontainers.image.source="https://github.com/ZA512/Stratum"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
WORKDIR /app

# Copy only production artifacts
COPY --chown=1000:1000 package*.json ./
COPY --chown=1000:1000 --from=deps /app/node_modules ./node_modules
COPY --chown=1000:1000 --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --chown=1000:1000 --from=builder /app/apps/backend/prisma ./apps/backend/prisma
# Prisma client is generated in root node_modules/.prisma
COPY --chown=1000:1000 --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=1000:1000 docker/entrypoint-backend.mjs /app/apps/backend/entrypoint-backend.mjs

WORKDIR /app/apps/backend

USER 1000

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["node","-e","const http=require('http');const req=http.get('http://127.0.0.1:4001/api/v1/health',res=>process.exit(res.statusCode&&res.statusCode<500?0:1));req.on('error',()=>process.exit(1));"]

CMD ["node","/app/apps/backend/entrypoint-backend.mjs"]
