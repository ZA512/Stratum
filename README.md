# Stratum (in Alpha mode)

NPM workspaces monorepo for the Stratum fractal kanban platform. The repository hosts the NestJS backend, the Next.js frontend and future shared packages.

## Structure

- apps/backend : NestJS API (Prisma, Swagger, Auth, Teams, Boards, Nodes)
- apps/frontend : Next.js 15 application (App Router, Tailwind)
- packages/shared : reserved for shared typings and utilities
- docs : functional scope, backlog, architecture, breadcrumb UX

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL instance (local or container) for Prisma

## Quick install

```bash
npm install

cd apps/backend
# Créer le fichier .env avec votre configuration PostgreSQL
# DATABASE_URL="postgresql://username:password@localhost:5432/stratum?schema=public"
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

## Run the apps

Backend:
```bash
npm run dev:backend
```

Frontend:
```bash
npm run dev:frontend
```

By default the backend exposes http://localhost:4001/api/v1 with Swagger documentation at http://localhost:4001/docs. The frontend runs on port 3000; override the backend URL with NEXT_PUBLIC_API_URL if required.

## Backend modules

- AuthModule : login, refresh, password reset, invitations
- UsersModule : current profile read/update
- TeamsModule : active teams filtered by memberships
- BoardsModule : board read endpoints (columns, nodes)
- NodesModule : create and convert nodes (simple / medium / complex)

REST contracts are documented via Swagger (/docs) and covered by the Jest e2e suite (npm run test:e2e).

## Demo data

npm run db:seed loads:

- 1 team "Stratum Core"
- user alice@stratum.dev with password "stratum"
- 1 root board with the 4 default columns
- sample nodes including a hierarchical structure for testing breadcrumb navigation

## Frontend notes

The dashboard lists teams returned by the API and links to the corresponding board page. /login calls /auth/login and keeps the session in localStorage.

Runtime variable:

- NEXT_PUBLIC_API_URL (defaults to http://localhost:4001/api/v1)

## Root scripts

- npm run dev:backend
- npm run dev:frontend
- npm run build:backend
- npm run build:frontend
- npm run test:e2e

## Database management

- npm run prisma:generate - Generate Prisma client
- npm run prisma:migrate - Apply database migrations
- npm run prisma:studio - Open Prisma Studio (database GUI)
- npm run db:seed - Load demo data
- npm run db:reset - Reset database and reload demo data

## Roadmap

1. Extract shared DTOs into packages/shared
2. Implement breadcrumb navigation and nested boards on the frontend
3. Add real-time updates (websocket or Socket.io)
4. Provide CI pipelines (lint, test, build) and Docker Compose packaging
