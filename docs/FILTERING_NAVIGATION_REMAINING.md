# Filtering Navigation Remaining Work

Date: 2026-03-11

## Current State

The core implementation is in place:

- full board tree payload is returned by the backend
- shared recursive matching engine is implemented
- Kanban, List, and Mindmap are connected to the same filtering data model
- shared filter bar supports search, comments toggle, owner, status, productivity, activity, chips, and board-scoped presets
- descendant navigation from Kanban cards is implemented

## Remaining Work

### 1. Project Validation

Most validation is now done.

- frontend lint: done
- frontend tests: done
- backend build: done
- backend tests: partially blocked by an existing test module wiring issue unrelated to filtering/navigation

Current status:

- active runtime used for successful validation: Node `v20.20.1`, npm `10.8.2`
- workspace dependencies were installed successfully
- Prisma client generation works with a valid `DATABASE_URL`

Observed status:

- `npm --prefix apps/frontend run lint`: passed with warnings only
- `npm --prefix apps/frontend run test`: passed (`21/21` tests)
- `npm --prefix apps/backend run build`: passed
- `npm --prefix apps/backend run prisma:generate`: passed with a valid PostgreSQL-style `DATABASE_URL`
- `npm --prefix apps/backend run test -- --runInBand`: still fails in `nodes.service.spec.ts` because `ActivityService` is not provided in the Nest testing module

Backend test failure details:

- failing file: `apps/backend/src/modules/nodes/nodes.service.spec.ts`
- failure type: Nest dependency resolution in test setup
- missing dependency: `ActivityService`
- this does not point to the filtering/navigation changes directly

Suggested commands once tooling is available:

```bash
nvm use 20
npm install
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run test
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/stratum_test'
npm --prefix apps/backend run prisma:generate
npm --prefix apps/backend run build
npm --prefix apps/backend run test
```

### 2. UI/UX Polish

The feature works, but a polish pass is still recommended.

- review spacing and overflow behavior in the shared filter bar on smaller widths
- verify chip truncation and `+N` overflow behavior with many active filters
- review family menus for keyboard and focus behavior
- review preset interactions for better affordance and naming clarity
- confirm the descendant tooltip is comfortable to use on dense Kanban boards

### 3. i18n Review

Most new strings were moved to translations, but a final check is still useful.

- verify all new labels render correctly in French and English
- confirm there are no remaining hardcoded strings in the new filtering flows
- review wording consistency between drawer, chips, and family menus

### 4. Functional Regression Pass

Even with clean editor diagnostics, the feature should still be exercised end-to-end.

- verify switching between Kanban, List, and Mindmap preserves shared filters correctly
- verify presets persist per board and do not leak across boards
- verify activity filters behave the same across Kanban, List, and Mindmap
- verify comment search behaves the same across Kanban and List
- verify descendant navigation opens the correct board and task
- verify highlight and scroll-to-card behavior after descendant navigation
- verify root, subtree, and current scope logic in List view

### 5. Optional Cleanup

These are not blockers, but may improve maintainability.

- reduce duplicated presentation logic between shared filter bar chips and family menus
- consider centralizing shared filter option metadata in one config file
- consider adding tests around `board-tree-filtering.ts`

## Done Criteria

The work can be considered finished when:

- frontend lint passes
- frontend tests pass
- backend build passes
- backend tests are either green or the unrelated `ActivityService` test wiring issue is fixed/accepted separately
- no regression is found in the three board views
- saved presets work reliably across reloads and board changes
- shared filters behave consistently across all supported views