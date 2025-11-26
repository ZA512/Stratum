# Team Feature Inventory

This document enumerates the major usages of the legacy team concept across the repository. The goal is to support the removal of teams in favor of personal workspaces owned directly by users.

## Progress tracker

- [x] Inventory existing team-dependent code paths (this document).
- [x] Add a personal board bootstrap endpoint so clients no longer need to pass a team identifier.
- [x] Remove the team-scoped board fetch endpoint in favor of the personal board flow.
- [ ] Remove team data structures from Prisma and backfill owner-centric relationships (column behaviors are now global but other tables still reference teams).
- [x] Update personal workspace bootstrap to rely solely on board ownership (nodes now carry a `workspaceId` matching their board, allowing bootstrap flows to avoid guessing a `teamId`).
- [ ] Update backend services and DTOs to operate without `teamId` (board write guards now rely solely on owners; dashboards now validate board ownership but remaining services still emit `teamId`).
- [ ] Simplify frontend routing and API clients to stop referencing teams (dashboards UI now works from the personal board without team selectors, other areas still depend on teams).
- [ ] Migrate RACI presets away from the team abstraction.
- [ ] Re-run automated tests and manual smoke checks after the removal.

## Database layer (`apps/backend/prisma`)

- `apps/backend/prisma/schema.prisma`
  - Models depending on teams: `Team`, `Membership`, `AutomationRule.teamId`, `Invitation.teamId`.
  - Enums such as `MembershipStatus` still used throughout the services.
  - ✅ `Node.workspaceId` now stores the owning board identifier so new records no longer depend on `teamId` to resolve their workspace; legacy fields remain until the teams table disappears.
- Migrations under `apps/backend/prisma/migrations/`
  - `20251023120000_add_node_workspace/migration.sql` backfills `Node.workspaceId` from existing boards and columns and enforces the new index.
  - `20250919232547_init/migration.sql` creates the `Team` table and all foreign keys on `teamId`.
  - `20250920100000_auth_enhancements.sql` and `20250923163019_auth_enhancements/migration.sql` extend the invitation workflow with `teamId` references.
  - `20251015120000_personal_board_isolation/migration.sql` adds the `Team.isPersonal` flag.
- Seed/reset scripts under `apps/backend/prisma/` (`reset-personal.ts`, `seed.ts`) bootstrap personal teams, create memberships, column behaviors, and boards scoped by `teamId`.
  - ✅ Bootstrap now seeds `workspaceId` values using deterministic board IDs; path prefixes still rely on `teamId` and must be migrated in a later step.

## Backend application (`apps/backend/src`)

- `modules/boards/boards.service.ts`
  - Personal board mutations now require the authenticated user to match `Board.ownerUserId`; team memberships are no longer consulted when authorizing writes.
  - Column behavior defaults are provisioned from global behaviors rather than team-scoped records.
- `modules/boards/boards.controller.ts`
  - Exposes `GET /boards/me` to bootstrap or return the personal board for the authenticated user, reducing the need to surface team identifiers to clients.
  - Legacy `GET /boards/team/:teamId` route removed; diagnostics now repair boards without touching team memberships.
- `modules/nodes/nodes.service.ts`
  - Permission checks (`ensureUserCanWrite`) query the `Membership` table with `teamId`.
  - Board promotion, archive, share, and notification code propagate `teamId` through DTOs and metadata.
- `modules/dashboards/*`
  - REST controllers now rely on authenticated ownership of the requested board instead of a `teamId` query parameter.
  - Service logic validates `Board.ownerUserId` and no longer filters data by `teamId`.
- `modules/auth/auth.service.ts`
  - Registration/login bootstrap calls `TeamsService.bootstrapForUser` to guarantee a personal team and board.
  - Invitation APIs (`createInvitation`, `acceptInvitation`) persist `teamId`.
- `modules/teams/*`
  - Exposes REST endpoints (`/teams`) to list teams, members, and bootstrap personal boards.
- `modules/users/users.service.ts`
  - `getProfileWithTeams` embeds membership listings in the profile payload.

## Frontend application (`apps/frontend`)

- Routing under `src/app/boards/[teamId]/` renders boards and nodes scoped by `teamId` in the URL.
- `src/app/page.tsx` fetches teams on login (`fetchTeams`, `bootstrapTeams`) to decide which board to open.
- `src/app/settings/page.tsx` and `src/features/users/raci-teams-api.ts` manage saved RACI presets labelled as "teams".
- Components such as `BoardTaskCard`, `BoardPageShell`, and `MoveCardDialog` include `teamId` in API calls.
- Dashboards client (`src/features/dashboards/DashboardPageShell.tsx`) now hides team selection and fetches dashboards directly from the personal board.

## Shared packages (`packages/api`, `packages/ui`)

- API client wrappers inside `packages/api` expose `/teams` endpoints and expect `teamId` arguments for board, node, and dashboard requests.
- UI state (contexts/selectors) depend on a current `teamId` to resolve the active board.

## High-level removal steps

1. **Database & Prisma**
   - Drop the `Team`, `Membership`, and `teamId`-dependent foreign keys from the schema and migrations.
   - Introduce owner-centric fields (e.g., `ownerUserId`) where needed.
   - Provide a migration to migrate existing records and drop the obsolete tables.
2. **Backend services**
   - Replace membership-based authorization with owner/share checks.
   - Remove the Teams module and adjust authentication bootstrapping to create personal boards directly.
   - Update all DTOs and controllers to stop accepting `teamId` parameters.
3. **Frontend & API clients**
   - Simplify routing to focus on personal boards (remove `[teamId]` segments).
   - Update API hooks to call the new owner-based endpoints.
   - Preserve RACI presets by storing raw user ID lists instead of referencing teams.
4. **Testing & manual validation**
   - Re-run unit/e2e suites after the schema and API refactors.
   - Manually smoke-test critical flows: login, board navigation, task sharing, and RACI editing.

This inventory is intended as a checklist for the upcoming refactor that removes the team abstraction from the product surface.
