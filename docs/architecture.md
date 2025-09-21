# Stratum - Architecture initiale

## 1. Vision generale
Stratum est une plateforme Kanban fractale API-first. Toutes les surfaces (web, mobile, integrations) consomment une API NestJS. Le coeur du systeme repose sur le concept de Node qui represente n'importe quelle tache/projet et peut se transformer en tableau Kanban autonome. L'objectif est de fournir une UX fluide, temps reel, avec une gouvernance partagee et une internationalisation immediate (anglais/francais).

## 2. Architecture logique

### 2.1 Backend (NestJS)
- **Modules principaux**
  - Auth & Accounts : gestion utilisateurs, SSO (OIDC), avatars, profils, preferences.
  - Teams & Memberships : equipes, invitations, roles (heritage RACI), titres personnalises.
  - Nodes : creation, hierarchie, metadonnees, types (simple/moyen/complexe), dependances.
  - Boards & Columns : kanbans, comportements de colonnes, regles de transitions.
  - Tasks & Todos : contenu des cartes, checklists, commentaires, pieces jointes.
  - Workflow Automation : regles (rappels, escalades), planifiees via BullMQ.
  - Activity & Notifications : journalisation, notifications (email/push/in-app), webhooks.
  - Analytics : calculs agreges (burndown, SLA blocage), exports.
  - Localization : ressources multi-langues, preferences utilisateur.
- **Technologies**
  - NestJS + Prisma ORM sur PostgreSQL.
  - Redis pour cache, session stateless, verrous, files de jobs BullMQ.
  - Socket.IO pour temps reel (board updates, presence, notifications).
  - Swagger + OpenAPI contract (API first).

### 2.2 Frontend (Next.js + React)
- Architecture CSR/SSR hybride, routes app directory.
- State management : React Query (API-first), Zustand ou Redux-toolkit pour etat local temps reel.
- dnd-kit pour drag & drop, Framer Motion pour transitions.
- i18next + next-intl pour multi-langues (en-us fr-fr) des le MVP.
- Socket layer pour updates temps reel, optimistic UI.
- Theming : CSS variables + Tailwind (ou Stitches) avec support dark/light, import/export JSON.

### 2.3 Infrastructure & DevOps
- Docker (multi-stage) pour NestJS, Next.js, worker BullMQ.
- PostgreSQL, Redis, Caddy proxy, S3-compatible storage (MinIO) pour fichiers.
- GitHub Actions : CI lint/test/build, CD vers environments (staging/prod) sur AWS/GCP ou Fly.io.
- Sentry pour monitoring, OpenTelemetry pour traces, Prometheus/Grafana pour metriques.
- Feature flags (Unleash/ConfigCat) envisages pour deploiements progressifs.

## 3. Modele de domaine

### 3.1 Entites cles
- User (id, email, password hash/SSO, profile, locale, theme prefs).
- Team (id, name, settings, governance).
- Membership (user, team, title, invitations).
- Node (id, teamId, parentId nullable, type simple/moyen/complexe, depth, path, metadata JSONB).
- Board (id, nodeId, layout config, theme override).
- Column (id, boardId, name, behavior enum, position, WIP limits, SLA config).
- Task (alias Node simple/moyen) avec champs : description, due dates, assignees, tags, progress stats.
- Checklist (id, nodeId, items, progress).
- Dependency (sourceNodeId, targetNodeId, type finish-to-start, lag).
- Attachment, Comment, ActivityLog, Notification, AutomationRule.

### 3.2 Relations
- Node forme un arbre -> utiliser nested set ou materialized path (champ path text).
- Chaque Node peut posseder un Board (type complexe). Colonnes heritent comportements du parent par defaut.
- Column.behavior renvoie vers table ColumnBehavior parametrable (Backlog, InProgress, Blocked, Done, Custom...).
- Dependances controlees pour eviter cycles (graph acyclique).

## 4. Flux fonctionnels principaux

1. Creation de projet (root node)
   - POST /nodes type complex -> genere board racine avec colonnes par defaut (Backlog, In Progress, Blocked, Done).
   - Invite team members, configure roles.

2. Affichage Kanban
   - GET /boards/{id} -> colonnes + cartes (nodes enfants). Layout + theming.
   - WebSocket room board:{id} push updates (drag/drop, statut, toasts).

3. Transformation d'une tache
   - PATCH /nodes/{id} type complex -> provisionne Board enfant, clone colonnes par defaut.
   - Breadcrumb mis a jour cote frontend via hierarchie path.

4. Gestion du backlog expirable
   - Cron BullMQ verifie Node en backlog avec expiresAt -> passe en Archived + notification.
   - Actions utilisateur POST /nodes/{id}/revalidate.

5. Statut Bloque
   - Column.behavior = Blocked active rappels BullMQ (target user ou custom contact).
   - Stocker blockedReason, reminderTarget.

6. Dependencies & Validation
   - Hook Prisma verifie completion de prerequis avant passer en Done.
   - UI affiche graph dependances, signale blocages.

## 5. Internationalisation (i18n)
- Backend renvoie libelles cles, mais UI gere traduction via dictionnaires JSON.
- API inclut Accept-Language -> fallback en-US.
- Contenu utilisateur stocke comme texte libre; labels systeme versionnes.

## 6. Securite & Permissions
- Auth : JWT (access + refresh), support OIDC (Google, Azure AD).
- RBAC heritage : roles definis sur Node -> cascade vers enfants sauf override.
- Scopes API : lecture seule, edition, admin.
- Audit log : chaque mutation loggee (actor, node, change).
- Rate limiting via Redis, protection CSRF pour panel web si SSR.

## 7. Performance & Scalabilite
- Index sur Node.path, Node.teamId, Column.behavior.
- Cache des vues Kanban (snapshot par board) invalide via events.
- Chunking de sous-niveaux (virtual scrolling) pour gros boards.
- Streaming SSE/WebSocket pour analytics en temps reel.

## 8. Observabilite & Tests
- Tests unitaires NestJS (Jest), e2e (Supertest), contract tests OpenAPI.
- Frontend : Vitest/RTL, Cypress pour e2e.
- Storybook pour composants (breadcrumb layers, cards).
- Telemetry : tracing inter-services, logs structures (Pino).

## 9. Prochaines etapes
1. Definir schemas Prisma User, Team, Node, Board, Column.
2. Ecrire contrats OpenAPI pour modules fondation.
3. Mettre en place pipeline CI (lint/test/build) et controle qualite.
4. Prototyper breadcrumb layered en React + Figma pour micro-interactions.

