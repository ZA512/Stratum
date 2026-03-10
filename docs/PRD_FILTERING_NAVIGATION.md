# PRD - Filtering System and Navigation Improvements

Status: Draft
Date: 2026-03-10
Product: Stratum
Scope: Board route for Kanban, List, Mindmap

## 1. Problem Statement

Stratum already exposes the same task dataset through multiple views under the board route:

- Kanban in `apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardPageShell.tsx`
- List in `apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardListView.tsx`
- Mindmap in `apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardMindmapView.tsx`

The current implementation does not yet provide one coherent filtering model across those views.

Observed repository facts:

- A shared board filter context already exists in `BoardFilterContext.tsx`, but it currently covers only `searchQuery`, assignees, priorities, efforts, `hideDone`, and `onlyMine`.
- The list view still owns a second, richer filter state in `BoardListView.tsx`, including quick chips, advanced filters, render modes, scope, context mode, sorting, visible columns, and saved personal views.
- Mindmap applies only a limited client-side status filter and title/description search over currently loaded nodes.
- Kanban filters only the current board level and does not expose recursive descendant-match indicators.

The result is a UX where `Strata`, `Filters`, and `View` are not cleanly separated. The user can switch visual projections, but filtering semantics change depending on the projection.

This feature redesigns filtering and navigation so that:

- `Strata` = current hierarchical position
- `Filters` = visible subset of tasks
- `View` = Kanban, List, or Mindmap projection

Switching view must preserve current strata and active filters.

## 2. Goals and Non-Goals

### Goals

- Provide one view-independent filtering model for Kanban, List, and Mindmap.
- Preserve filters when switching between views.
- Persist filters between sessions in browser local storage.
- Support recursive search behavior on the task tree.
- Add descendant match indicators and navigation affordances.
- Keep the list tree readable while filtered.
- Keep Kanban columns visible even when empty.
- Keep filtering primarily client-side when feasible.

### Non-Goals

- Timeline/Gantt is out of scope for this feature.
- Replacing the existing board route, React Query setup, or Next.js structure is out of scope.
- Introducing a new backend search platform or a separate filtering service is out of scope for MVP.
- Cross-device sync of filters is out of scope for MVP because the requirement explicitly targets browser local storage.

## 3. UX Principles

### 3.1 Single Mental Model

The system must use one consistent model across views:

- Current strata identifies where the user is in the hierarchy.
- Filters identify which tasks from the current hierarchical dataset are visible or marked as relevant.
- View controls only how those tasks are rendered.

### 3.2 View Independence

The same active filters must apply in:

- Kanban
- List
- Mindmap

Changing from one view to another must not clear, reinterpret, or remap filters.

### 3.3 Hierarchical Transparency

Because Stratum operates on a task tree:

- a task must remain visible if it matches directly
- a task must also remain visible when a descendant matches
- the UI must distinguish direct matches from descendant-context matches

### 3.4 Local, Fast, Understandable Feedback

- Filter changes update results immediately.
- Filters are presented directly in the shared filter bar next to the search field.
- Chips appear under the search bar in creation order.
- Removing a chip immediately updates results.
- The UI displays `X tasks shown out of Y`.
- The UI displays a persistent `Filtered view` indicator near the result counter whenever any filter is active.
- Animations remain subtle, around 150 ms.

## 4. Current Architecture Baseline

This PRD is based on the current repository structure, not a hypothetical architecture.

### Frontend structures already present

- Shared board filters: `apps/frontend/src/app/boards/[teamId]/[[...board]]/context/BoardFilterContext.tsx`
- Shared filter types: `apps/frontend/src/app/boards/[teamId]/[[...board]]/types/board-filters.ts`
- Shared filter bar and drawer: `BoardFilterBar.tsx`, `BoardFilterDrawer.tsx`
- Board route coordinator: `BoardPageShell.tsx`
- List view and subtree loading logic: `BoardListView.tsx`
- Mindmap rendering and local storage state: `BoardMindmapView.tsx`
- Board route UI preferences: `apps/frontend/src/features/boards/board-ui-settings.tsx`

### Backend structures already present

- Board detail transport: `apps/backend/src/modules/boards/boards.controller.ts` and `boards.service.ts`
- Node comments transport: `apps/backend/src/modules/nodes/nodes.controller.ts` and `nodes.service.ts`
- Activity logs transport: `apps/backend/src/modules/activity/activity.controller.ts` and `activity.service.ts`
- Generic user preferences storage in user JSON preferences: `apps/backend/src/modules/users/users.service.ts`

### Architectural implication

The redesign must extend the existing board route state and existing backend modules. It must not introduce a separate filtering layer outside the current board route/component structure unless later justified by performance limits.

The existing drawer component remains part of the architecture, but it is not the container for filters in the final product decision. Filters belong in the shared filter bar. The drawer is reserved for view-specific visual preferences such as Kanban card display options, Mindmap visual options, and comparable UI preferences.

## 5. Functional Requirements

### 5.1 Filter Placement and Order

All shared filters appear directly in the shared filter bar next to the search field.

The drawer must not contain filters.

The drawer is reserved for visual preferences, for example:

- Kanban card display options already coordinated from `BoardPageShell.tsx`
- Mindmap visual options already coordinated from `BoardMindmapView.tsx`
- other non-filter UI preferences already aligned with the board route

Required filter order in the shared filter bar:

1. Search
2. Productivity
3. Owner
4. Status
5. Activity
6. Priority

Priority must appear last.

### 5.2 Global Search Field

One global search field is displayed for Kanban, List, and Mindmap.

Search must match:

- task title
- task description
- task id

Search behavior:

- case insensitive
- accent insensitive
- comment search optional and disabled by default
- comment search enabled through a toggle inside the search field UI

Search UI requirement:

- the search field includes an icon toggle for `include comments`
- enabling this toggle activates comment search
- the search family still produces a single chip

Repository alignment:

- Accent-insensitive normalization already exists via `normalizeText()` in `utils/search-tokens.ts`.
- Kanban search already matches title, description, `id`, and `shortId` on current-level cards.
- List search already normalizes accents and matches multiple fields, but uses its own query model.
- Mindmap currently searches title and description only over loaded nodes.

Product requirement:

- The search field becomes the canonical text search input for all views.
- The search field itself is a filter family.
- Applying a search produces a single search chip.
- `id` matching must cover the task identifier exposed to users today (`shortId`) and the internal node id when available in the loaded dataset.
- Comment search remains off by default.
- When comment search is enabled, that state is part of the search filter and must still produce a search-family chip even if no other filter family is active.

### 5.3 Filter Chips

Each filter family generates one removable chip.

Rules:

- Chips appear under the search bar.
- Chips appear in order of creation.
- Removing a chip updates results immediately.
- A `Clear Filters` action clears all active filters.
- Clicking a chip reopens the corresponding filter selector.
- Users can modify a filter from its chip without deleting and recreating it.
- Search generates a single chip.
- Comment search enabled from the search UI is represented inside the search chip model, so the search family still renders a single chip.
- Productivity generates a single chip.
- Owner generates a single chip.
- Status generates a single chip.
- Activity generates a single chip.
- Priority generates a single chip.

Specific requirement for Activity:

- The two-level activity filter generates one chip summarizing the period and selected activity types.

Examples:

- `search: ecole`
- `priority: high`
- `status: in progress`
- `activity: 7d (creation + modification)`

### 5.4 Filter Families

The following view-independent filters must exist.

#### Productivity

Quick filters:

- Today
- Overdue
- This week
- Next 7 days
- No deadline

#### Owner

Options:

- Me
- Unassigned
- Collaborators list

#### Status

Values map to current Kanban column behaviors:

- Backlog
- In progress
- Blocked
- Done

#### Activity

Two-level filter:

- first level: period (`Today`, `Last 7 days`, `Last 30 days`, `Custom date`)
- second level: activity type (`Creation`, `Modification`, `Comment`)
- multi-select inside activity types
- single summary chip output

Quick presets inside Activity:

- Any activity today
- Any activity last 7 days
- Any activity last 30 days

These presets automatically select all activity types.

Selected activity types for each quick preset:

- `Creation`
- `Modification`
- `Comment`

#### Priority

- Priority filter exists and appears last in the filter list.

### 5.5 Filter Logic

Logical rules:

- Between filter families: `AND`
- Within one family: `OR`

Examples:

- `priority = high OR medium`
- `AND status = in progress`

### 5.6 Persistence

Filters persist:

- between views
- between sessions

Persistence target:

- browser local storage

Repository alignment:

- Shared board filters already persist in local storage by board id.
- List personal views already persist in local storage.
- Board view mode already persists in local storage by team id.

Product requirement:

- The redesigned filter state must use the existing board route local storage pattern.
- Persistence must cover the full shared filter model, not only the current limited shared subset.

### 5.7 Saved Filters

Users can save a filter set and reapply it later.

Requirements:

- Save current active filters as a named preset.
- Update an existing preset from the current active filters.
- Delete an existing preset.
- Apply an existing preset to the current board route.
- Presets are accessible from the shared filter UI.
- Applying a saved filter updates the current board route filter state.
- Saved filters use local storage for MVP.
- Saved filters are scoped per board.

Repository alignment:

- The list view already has `OfficialView` and `PersonalView` concepts stored in local storage.

Product requirement:

- Saved filters become a board-route concept, not a list-only concept.
- Existing list personal views should be treated as input for migration or replacement, not as the final architecture.

### 5.8 Result Counter and Filtered State Indicator

The shared filter bar must display:

- `X tasks shown out of Y`
- `Filtered view` when any filter is active

This counter must be view-independent and derived from the same filtered dataset.

## 6. Hierarchical Search Behavior

### 6.1 Visibility Rule

A task is visible if:

- it matches directly
- or one of its descendants matches

### 6.2 Match Types

Two match types must be represented:

- Direct match: the task card or row or node is highlighted.
- Descendant match: the task is visible because one or more descendants match.

Highlight behavior:

- highlighting uses a temporary overlay style
- highlighting does not modify base theme colors
- highlighting uses an overlay border, glow, or equivalent non-destructive emphasis
- the highlight fades automatically after about 2 seconds when used for navigation targeting

### 6.3 Descendant Match Indicator

For descendant matches, display an indicator:

- stack of 3 small cards
- highlighted background
- centered number
- CSS or SVG implementation
- theme compatible through the existing theme system
- values from `1` to `9`
- `+9` when the number exceeds 9

### 6.4 Descendant Tooltip

Hovering the indicator shows a tooltip listing matching descendants.

Rules:

- the tooltip is interactive
- mouse hover over the tooltip keeps it open
- clickable items inside the tooltip remain usable
- moving the cursor from the indicator to the tooltip must not close it immediately
- the tooltip shows up to 9 items in the visible viewport at once
- if more than 9 items exist, the tooltip becomes scrollable
- if more exist, show `+X more`
- clicking a result navigates to the descendant board level and updates the current strata
- after navigation, the UI scrolls to the target node
- the task drawer opens for the target node
- the target receives a temporary highlight for about 2 seconds

Descendant preview metadata must contain:

- `nodeId`
- `title`
- `boardId`
- `parentId`
- `depth`

## 7. View-Specific Behavior

### 7.1 Shared Rule Across Views

Kanban, List, and Mindmap must consume the same active filter state and the same filtered dataset semantics.

### 7.2 Kanban

Kanban continues to show tasks from the current strata level only.

Rules:

- Columns remain visible even when empty.
- If a current-level task matches directly, the card is highlighted.
- If only descendants match, the current-level parent card remains visible and shows the descendant-match indicator.
- Search and filters must not silently switch Kanban into subtree rendering.
- When descendant matches cause a parent card to appear, the card remains in its original Kanban column.
- Filtering never moves cards between columns.
- When filters produce zero matches, columns remain visible with zero cards in each column.
- A zero-state message is still displayed.

Repository alignment:

- Current Kanban filtering happens over `board.columns[].nodes` in `BoardPageShell.tsx`.
- Current board detail transport only includes current board columns and current-level nodes.

Implication:

- Descendant match indicators in Kanban require recursive descendant evaluation over the client-side loaded tree rather than repeated API calls during filtering.

### 7.3 List View

The list view must support a hierarchical tree display as the primary design target for this feature.

Requirements:

- chevrons to expand and collapse
- vertical connector lines showing hierarchy
- indentation follows `min(depth * 16px, 64px)`
- vertical connectors remain the dominant hierarchy indicator
- visual inspiration from GitHub and VS Code explorers

Filtered behavior:

- tree remains visible when filters are active
- ancestors of matches remain visible
- direct matches are highlighted
- ancestors are not highlighted unless they also match directly
- branches with no matches are hidden
- the tree structure remains readable

Repository alignment:

- The current list view already supports `TREE` and `FLAT` modes, subtree loading, expand/collapse state, and context rows for ancestor visibility.

Implication:

- The redesign should reuse the current tree behavior rather than replace it.
- The current list-only filter model should be reduced or remapped into the shared board-route filter model.

### 7.4 Mindmap

Mindmap must:

- highlight matching nodes
- expand branches containing matches

Repository alignment:

- Mindmap already supports selection, lazy subtree loading, status filtering, direct-match highlighting, context menu, center-on-node, and local storage for collapsed state and viewport.
- Mindmap search currently includes direct matches plus ancestor visibility for loaded nodes, but not descendant counters or shared filter parity.

Implication:

- Mindmap should continue to lazy-load subtrees where possible.
- When filters are active, branches containing matches must expand or remain expanded enough to reveal matches.

## 8. Navigation Requirements

### 8.1 Navigation Intent

The user must be able to navigate to the relevant hierarchical level from filtered results and descendant-match affordances.

### 8.2 Context Menu Actions

Context menus must include:

- Edit
- Open
- Center here

Repository alignment:

- Mindmap currently exposes `Edit`, `Center on node`, expand/collapse, create child, and `Open child board` when a child board exists.

Requirement:

- Normalize context menu semantics across views where relevant.
- `Center here` is mandatory for mindmap.
- For tasks without child boards, `Open` navigates to the node level in the hierarchy and changes the current strata.

### 8.3 Tooltip Navigation

Clicking a descendant result from the tooltip must:

- navigate to the descendant board level and update the current strata
- preserve active filters
- load the branch first if it is not yet loaded
- scroll to the target node
- open the task drawer
- apply a temporary highlight for about 2 seconds

## 9. Animations

Use subtle animations around 150 ms for:

- chip removal
- filtered results appearing
- view switching

Animations must not hide result-state changes or delay interaction.

## 10. Data Model Implications

This feature should extend the existing frontend filter types before requesting backend schema changes.

### 10.1 Existing frontend state model to extend

Current shared type in `board-filters.ts` contains:

- `searchQuery`
- `assigneeIds`
- `priorities`
- `efforts`
- `hideDone`
- `onlyMine`

### 10.2 Required shared filter fields

The unified board-route filter model must additionally represent:

- search filter state including optional comment-search toggle
- productivity quick filters
- owner filter with `Me`, `Unassigned`, collaborator ids
- status filter using current workflow states
- activity filter period plus selected activity types
- priority filter values
- chip creation order metadata
- saved-filter preset metadata

### 10.3 Matching Metadata Required Per Rendered Task

The UI needs runtime match metadata for each visible task:

- `directMatch: boolean`
- `descendantMatchCount: number`
- `descendantPreview: Array<{ nodeId: string, title: string, boardId: string, parentId: string, depth: number }>` capped for tooltip rendering

This metadata can be derived client-side when the required subtree is loaded. It does not require immediate database schema changes.

### 10.4 Comment Search Data

Comment search is the main area where existing loaded task data is insufficient.

Current repository state:

- comments are available per node detail and per node comments endpoint
- board detail payload does not include comment text

Implication:

- comment search cannot be implemented at full board-subtree scale only by extending the current direct board payload unless the client fetches a large volume of comment data or a backend search endpoint is added

## 11. Frontend State Model

### 11.1 Source of Truth

The existing `BoardFilterContext` should become the single board-route source of truth for shared filters.

Product rule:

- Kanban, List, and Mindmap consume the same filter state from the existing board route context.
- List-specific display state remains list-specific.
- Mindmap viewport/collapse state remains mindmap-specific.
- Kanban display preferences remain Kanban-specific.

### 11.2 What Becomes Shared

Shared state:

- search filter state including query and optional comment-search toggle
- productivity filters
- owner filter
- status filter
- activity filter
- priority filter
- chip order
- saved filter presets currently available in the shared filter UI
- result counts

Optional interaction state:

- chip hover feedback state when the UI can subtly preview the tasks affected by a filter family

### 11.3 What Remains View-Specific

Kanban-specific:

- column display preferences
- sorting/display preferences already stored in `BoardPageShell.tsx`

List-specific:

- `TREE` vs `FLAT`
- visible columns
- expand/collapse state
- context-mode display rules
- list-only sort controls if they remain in scope

Mindmap-specific:

- viewport
- collapsed nodes
- layout mode
- center/fit interactions

### 11.4 Local Storage Strategy

Use the existing local storage approach already present in the board route.

Required behavior:

- One shared filter storage key for the full shared model.
- Saved filter presets stored separately in local storage.
- Saved filter presets are scoped per board.
- Existing list-only saved views either migrate into the new format or remain deprecated behind a compatibility path.

### 11.5 Drawer Responsibility

The existing drawer remains in scope, but only for view-specific visual preferences.

Examples:

- Kanban card display options already present in `BoardPageShell.tsx`
- Mindmap visual options already present in `BoardMindmapView.tsx`
- other non-filter UI preferences that do not change the filtered dataset

## 12. API Implications

### 12.1 MVP Without Mandatory API Changes

The following should remain client-side for MVP once the task tree is loaded on the client:

- case-insensitive and accent-insensitive search on title, description, id
- owner, status, priority, due-date quick filters
- activity filter evaluation over the same hierarchical dataset used for recursive matching
- chip rendering and persistence
- result counters
- recursive descendant matching

This is aligned with the current board route direction, provided the client can load the task tree up to about 3000 tasks for filtering.

Task tree loading strategy:

- when entering the board route, the client loads the entire task tree for the current board scope in a single backend request
- the target size is up to about 3000 tasks
- filtering and recursive matching operate on this client-side tree
- the returned payload must include all nodes required for recursive matching
- N+1 loading strategies are out of scope for the filtering model
- lazy loading must not break filtering semantics across views
- if view-specific branch loading still exists for rendering concerns, it must not change filter results or descendant-match logic

### 12.2 API Gaps Identified in the Current Repository

#### Gap A: Recursive descendant matching for Kanban

Current Kanban board payload only contains current-level columns and nodes.

Needed for full requirement:

- one backend payload for the board route that includes the full task tree needed for client-side descendant evaluation without N+1 fetching

#### Gap B: Comment search across board trees

Current APIs expose comments per node, not as a board-subtree search index.

Needed for full requirement when comment search is enabled:

- either board-subtree comment corpus retrieval
- or board-subtree comment search endpoint

#### Gap C: Activity filter across hierarchical datasets

Current activity endpoints support:

- board direct-task activity
- node-level activity

They do not clearly expose recursive subtree activity filtering for arbitrary board scopes.

Needed if activity filter must cover the same hierarchical dataset as list subtree mode and Kanban descendant matching:

- recursive activity aggregation or recursive activity search within the loaded current board tree, with backend fallback only if needed

Product clarification:

- activity filtering operates on the same hierarchical dataset used for recursive matching
- activity filter behavior remains consistent across Kanban, List, and Mindmap

### 12.3 Recommended API Position

For MVP:

- keep non-comment filters client-side
- compute recursive descendant matches client-side on the loaded tree
- keep local persistence in the frontend
- avoid backend schema changes

Algorithm requirement:

- recursive matching uses post-order traversal
- step 1: evaluate node direct match
- step 2: evaluate descendants
- step 3: compute `descendantMatchCount`
- step 4: compute final visibility

Evaluation strategy requirement:

- search input uses a debounce of about 150 to 200 ms
- recursive matching results are memoized
- filtered tree metadata is reused across views
- recomputation occurs only when filter state changes

This avoids repeated traversal.

For scalability and full parity:

- evaluate adding one recursive board-subtree search/filter endpoint within existing backend modules only if the loaded-tree client-side approach does not meet performance targets

## 13. UI Components To Modify or Create

### Modify

- `BoardFilterContext.tsx`
  - expand shared filter state to the new unified model
- `board-filters.ts`
  - define the new shared filter types and persistence helpers
- `BoardFilterBar.tsx`
  - add result counter `shown / total`
  - add `Filtered view` indicator
  - render unified chips in creation order
  - support chip wrapping up to two visible lines
  - collapse additional chips behind `+N filters`
  - expose all filter families directly in the bar in the required order
  - expose the comment-search toggle inside the search field UI
  - expose saved-filter entry points
  - support chip click-to-edit behavior
  - support subtle chip-hover feedback when feasible
- `BoardFilterDrawer.tsx`
  - limit drawer responsibility to visual preferences and remove filters from it
- `BoardPageShell.tsx`
  - stop treating advanced Kanban filters as the main filter source
  - compute and pass consistent filtered counts to all views
  - keep Kanban display preferences in drawer-oriented UI rather than filter-oriented UI
- `BoardListView.tsx`
  - consume the unified shared filters as the primary filter source
  - keep tree rendering and display controls
  - migrate list personal views into shared saved filters or isolate them as list-only display presets
- `BoardMindmapView.tsx`
  - consume shared filters fully
  - support descendant match cues, branch expansion for matches, and normalized navigation semantics
- current Kanban card components (`BoardTaskCard.tsx` and related card renderers)
  - add direct-match highlight and descendant-match indicator rendering

### Create

- shared descendant-match indicator component for Kanban/List/Mindmap reuse
- shared descendant-match tooltip component
- shared saved-filter preset picker UI
- shared result-count helper utilities
- shared filter evaluation helpers for recursive matching and filter-family logic
- shared zero-result state UI with clear-filters action

These are component and utility additions inside the existing board route/frontend feature structure, not a new architectural layer.

## 14. Edge Cases

- A direct parent does not match, but multiple deep descendants do.
- More than 9 matching descendants exist.
- Filters produce zero visible direct matches in Kanban but some columns must still remain visible.
- Search query matches only by accent-insensitive normalization.
- Search query matches internal node id but no visible short id.
- A task has no deadline and `No deadline` is selected together with other due-date chips.
- `Me` and `Unassigned` are selected together.
- `Done` status is selected while a hide-done behavior is also active from legacy state.
- Saved filters created in list-only legacy storage conflict with new shared presets.
- Tooltip navigation targets a task whose branch is not yet loaded in mindmap.
- Comment search is enabled on a large subtree where comments are not preloaded.
- Activity filtering requires data that has not yet been fetched for all nodes in the current scope.
- Filters produce zero visible tasks in a previously populated scope.
- Switching view while async subtree loading is still in flight must not clear active filters.

## 14.1 Zero Result State

When filters produce zero visible tasks, the UI must display:

- `No tasks match current filters`
- a visible `Clear filters` action

This zero-result state must be available consistently across Kanban, List, and Mindmap.

Kanban-specific zero-result behavior:

- columns remain visible
- zero cards appear in columns
- the zero-state message still displays

## 15. Performance Considerations

### 15.1 Target

Support at least 3000 tasks.

### 15.2 Preferred Strategy

Filtering and recursive matching should run client-side on the loaded task tree.

This is aligned with the current frontend implementation for:

- Kanban current-level filtering
- List subtree loading and client-side filtering
- Mindmap local search over loaded nodes

### 15.3 Known Constraints From Current Code

- List subtree loading currently chains `fetchBoardDetail` and `fetchChildBoards` per board.
- Mindmap loads subtrees lazily.
- Kanban does not load descendants by default.
- Comments are not preloaded at board level.

Product clarification:

- the final filtering model assumes a complete client-side tree for the current board scope at board-route entry, delivered in one backend request
- any remaining lazy loading must be a rendering concern only and must not change filtering semantics

### 15.4 Performance Guidance

- Keep title/description/id filtering fully client-side.
- Debounce search input by about 150 to 200 ms.
- Compute direct-match state during the same pass as shared filter evaluation.
- Compute descendant-match state with one post-order traversal, not repeated per view.
- Memoize recursive matching results.
- Reuse filtered tree metadata across views during a single board session where possible.
- Recompute recursive matching only when filter state changes.
- Do not rely on repeated API calls to compute descendant matches during filtering.
- Assume the client can load the task tree up to about 3000 tasks and evaluate recursive matches locally.
- Avoid loading all comments unless comment search is explicitly enabled.
- If recursive descendant evaluation or comment search pushes interaction above acceptable UI latency, introduce one backend subtree endpoint inside the existing Boards or Nodes modules as a fallback rather than as the primary design.

### 15.5 Acceptable Degradation Path

If the loaded-tree client-side approach cannot meet the 3000-task target for recursive matching and comment search:

- keep base filters client-side
- move recursive search indexing and optional comment search to a backend subtree endpoint

## 16. Delivery Scope

### MVP

- unified shared filter model across Kanban, List, Mindmap
- shared search and chips
- persistence between views and sessions via local storage
- result counter
- recursive direct/descendant matching semantics
- list tree preserved under filters
- mindmap branch expansion for matches
- Kanban descendant-match indicator
- saved filters in local storage

### Post-MVP candidates

- migration of legacy list personal views
- backend recursive endpoint for comment search and large-tree acceleration
- cross-device synchronization through user preferences

## 17. Open Questions

These questions are intentionally left open because the repository does not provide enough evidence to answer them safely.

1. Should comment search include only task comments directly attached to matched nodes, or also comments from descendants when evaluating ancestor visibility?

2. Is `id` intended to mean internal node id, short id, or both in user-facing search behavior?

3. Should the existing list `OfficialView` presets remain as list-display presets, or be replaced entirely by shared saved filters?

4. For comment search on large trees, is a backend recursive search endpoint acceptable for MVP if client-side loaded-tree filtering is too slow, or must MVP remain strictly client-side?

5. Are activity type mappings expected to use current `ActivityType` enum groupings exactly, or should product define a simpler abstraction where multiple backend activity types map into `Creation`, `Modification`, and `Comment`?

## 18. Success Criteria

The feature is successful when:

- the same filters remain active while switching between Kanban, List, and Mindmap
- search is accent-insensitive and case-insensitive
- a parent remains visible when descendants match
- direct matches and descendant matches are visually distinguishable
- users can save and reapply filter sets
- result counts are visible and accurate
- the interaction remains responsive on large board trees within the agreed performance budget
