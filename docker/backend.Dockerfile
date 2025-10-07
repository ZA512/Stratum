# Backend (NestJS) multi-stage build
FROM node:20-alpine AS base
WORKDIR /app

# Copie fichiers principaux monorepo
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages

# Installer dépendances (optimisation possible via npm ci + cache mounts)
RUN npm install --workspace backend --include-workspace-root --omit=dev=false

# Générer client Prisma (si schema dans apps/backend/prisma)
WORKDIR /app/apps/backend
RUN npx prisma generate

# Build
RUN npm run build

# --- Image de production ---
FROM node:20-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app

# Copier uniquement ce qui est nécessaire
COPY package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/backend/dist ./apps/backend/dist
COPY --from=base /app/apps/backend/prisma ./apps/backend/prisma
COPY docker/entrypoint-backend.sh /app/apps/backend/entrypoint-backend.sh

WORKDIR /app/apps/backend
RUN chmod +x entrypoint-backend.sh
EXPOSE 4001

ENTRYPOINT ["/bin/sh", "/app/apps/backend/entrypoint-backend.sh"]
