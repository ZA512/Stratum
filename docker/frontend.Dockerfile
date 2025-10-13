# Frontend (Next.js) multi-stage
FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm install --workspace frontend --include-workspace-root --omit=dev=false

WORKDIR /app/apps/frontend
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# call the local frontend package build script (package.json contains "build")
RUN npm run build

# --- Production image ---
FROM node:20-alpine AS prod
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
WORKDIR /app

COPY package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=base /app/apps/frontend/public ./apps/frontend/public

WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
