# Filtering Navigation Remaining Work

Date: 2026-03-10

## Current State

The core implementation is in place:

- full board tree payload is returned by the backend
- shared recursive matching engine is implemented
- Kanban, List, and Mindmap are connected to the same filtering data model
- shared filter bar supports search, comments toggle, owner, status, productivity, activity, chips, and board-scoped presets
- descendant navigation from Kanban cards is implemented

## Remaining Work

### 1. Project Validation

This is the main unfinished item.

- run frontend lint
- run frontend tests
- run backend build
- run backend tests if needed for board detail contract changes
- fix any issues found by those commands

Current blocker:

- `npm` is not installed in the current environment, so `lint` and `build` could not be executed here

Suggested commands once tooling is available:

```bash
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run test
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
- backend build passes
- no regression is found in the three board views
- saved presets work reliably across reloads and board changes
- shared filters behave consistently across all supported views