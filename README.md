# Stratum Monorepo

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

`ash
npm install

cd apps/backend
cp .env.example .env
npm run prisma:migrate
npm run db:seed
`

## Run the apps

Backend:
`ash
npm run dev:backend
`

Frontend:
`ash
npm run dev:frontend
`

By default the backend exposes http://localhost:3000 (API available under /api/v1). The frontend also runs on port 3000; override the base URL with NEXT_PUBLIC_API_URL if required.

## Backend modules

- AuthModule : login, refresh, password reset, invitations
- UsersModule : current profile read/update
- TeamsModule : active teams filtered by memberships
- BoardsModule : board read endpoints (columns, nodes)
- NodesModule : create and convert nodes (simple / medium / complex)

REST contracts are documented via Swagger (/docs) and covered by the Jest e2e suite (
pm run test:e2e).

## Demo data


pm run db:seed loads:

- 1 team Stratum Core
- user lice@stratum.dev with password stratum
- 1 root board with the 4 default columns
- sample nodes including a checklist

## Frontend notes

The dashboard lists teams returned by the API and links to the corresponding board page. /login calls /auth/login and keeps the session in localStorage.

Runtime variable:

- NEXT_PUBLIC_API_URL (defaults to http://localhost:3000/api/v1)

## Root scripts

- 
pm run dev:backend
- 
pm run dev:frontend
- 
pm run build:backend
- 
pm run build:frontend
- 
pm run test:e2e

## Roadmap

1. Extract shared DTOs into packages/shared
2. Implement breadcrumb navigation and nested boards on the frontend
3. Add real-time updates (websocket or Socket.io)
4. Provide CI pipelines (lint, test, build) and Docker Compose packaging
