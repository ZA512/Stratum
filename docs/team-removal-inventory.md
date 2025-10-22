# Team Feature Inventory

This document enumerates the major usages of the legacy team concept across the repository. The goal is to support the removal of teams in favor of personal workspaces owned directly by users.

## Database layer (`apps/backend/prisma`)

- `apps/backend/prisma/schema.prisma`
  - Models depending on teams: `Team`, `Membership`, `Node.teamId`, `ColumnBehavior.teamId`, `AutomationRule.teamId`, `Invitation.teamId`.
  - Enums such as `MembershipStatus` still used throughout the services.
- Migrations under `apps/backend/prisma/migrations/`
  - `20250919232547_init/migration.sql` creates the `Team` table and all foreign keys on `teamId`.
  - `20250920100000_auth_enhancements.sql` and `20250923163019_auth_enhancements/migration.sql` extend the invitation workflow with `teamId` references.
  - `20251015120000_personal_board_isolation/migration.sql` adds the `Team.isPersonal` flag.
- Seed/reset scripts under `apps/backend/prisma/` (`reset-personal.ts`, `seed.ts`) bootstrap personal teams, create memberships, column behaviors, and boards scoped by `teamId`.

## Backend application (`apps/backend/src`)

- `modules/boards/boards.service.ts`
  - Most read/write paths require a `teamId` for authorization and board lookup.
  - Column behavior caching relies on `teamId` to provision default columns.
- `modules/nodes/nodes.service.ts`
  - Permission checks (`ensureUserCanWrite`) query the `Membership` table with `teamId`.
  - Board promotion, archive, share, and notification code propagate `teamId` through DTOs and metadata.
- `modules/dashboards/*`
  - REST controllers expect a `teamId` query parameter and validate membership before loading analytics.
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
