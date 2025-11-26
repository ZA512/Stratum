# Backend (NestJS) multi-stage build optimized for GHCR
# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install only production dependencies first for better caching
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY packages ./packages

# Use cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace backend --include-workspace-root

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# npm workspaces hoists dependencies to root node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY apps/backend ./apps/backend
COPY packages ./packages

# Generate Prisma client
WORKDIR /app/apps/backend
RUN npx prisma generate

# Build the application
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS prod

# OCI labels for GHCR
LABEL org.opencontainers.image.title="Stratum Backend"
LABEL org.opencontainers.image.description="NestJS backend API for Stratum"
LABEL org.opencontainers.image.source="https://github.com/ZA512/Stratum"
LABEL org.opencontainers.image.licenses="UNLICENSED"

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

ENV NODE_ENV=production
WORKDIR /app

# Copy only production artifacts
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
# Prisma client is generated in root node_modules/.prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY docker/entrypoint-backend.sh /app/apps/backend/entrypoint-backend.sh

WORKDIR /app/apps/backend

# Normalize entrypoint and set permissions
RUN sed -i 's/\r$//' entrypoint-backend.sh && \
    sed -i '/^```/d' entrypoint-backend.sh && \
    sed -i "1s/^\xef\xbb\xbf//" entrypoint-backend.sh && \
    chmod +x entrypoint-backend.sh && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

ENTRYPOINT ["/bin/sh", "/app/apps/backend/entrypoint-backend.sh"]
