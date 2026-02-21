# PRD Technique — Vue Mindmap (Carte Heuristique Radiale)

> **Statut :** Draft  
> **Auteur :** Architecture Stratum  
> **Date :** 2026-02-20  
> **Cible :** IA d'implémentation  

---

## Table des matières

1. [Vision produit](#1-vision-produit)
2. [Architecture technique](#2-architecture-technique)
3. [Modèle de transformation des données](#3-modèle-de-transformation-des-données)
4. [Algorithme de layout radial](#4-algorithme-de-layout-radial)
5. [UX détaillée](#5-ux-détaillée)
6. [Performance](#6-performance)
7. [Accessibilité](#7-accessibilité)
8. [API backend](#8-api-backend)
9. [État global UI](#9-état-global-ui)
10. [Plan d'implémentation](#10-plan-dimplémentation)
11. [Risques techniques](#11-risques-techniques)
12. [Export & Snapshot Strategy](#12-export--snapshot-strategy)
13. [Plan de migration et interchangeabilité du renderer](#13-plan-de-migration-et-interchangeabilité-du-renderer)

---

## 1. Vision produit

### 1.1 Rôle stratégique

La vue Mindmap est la **quatrième projection** de la hiérarchie Stratum. Elle offre une vision spatiale et structurelle de l'arbre des nodes, centrée sur un node courant (racine ou intermédiaire).

| Vue | Question à laquelle elle répond |
|---|---|
| **Kanban** | Où en est chaque tâche dans le workflow ? |
| **Liste** | Quelles tâches correspondent à mes critères de recherche ? |
| **Timeline (Gantt)** | Comment les tâches s'enchaînent-elles dans le temps ? |
| **Mindmap** | Quelle est la structure hiérarchique de mon projet ? |

La Mindmap permet de :
- Visualiser la profondeur et l'ampleur d'un sous-arbre en un coup d'œil.
- Identifier les branches déséquilibrées (trop de nodes dans une branche).
- Naviguer rapidement dans la hiérarchie (double-clic → descendre dans un node).
- Comprendre l'organisation fractale sans devoir cliquer board par board.

### 1.2 Contraintes produit non négociables

- **Lecture seule** pour la V1. Pas de drag-and-drop de réorganisation. Le modèle métier n'est pas modifié.
- La source de données est **identique** aux autres vues (même `Board` + `childBoards` + fetch récursif).
- La vue fonctionne aussi bien en tant que racine workspace qu'en tant que sous-arbre d'un node intermédiaire.
- La vue doit être utilisable sur desktop (≥ 1024px). Le responsive mobile est hors scope V1.

---

## 2. Architecture technique

### 2.1 Choix de la librairie de rendu : **Konva + react-konva (Canvas 2D structuré)**

#### Décision

Le rendu utilise **Konva** (`konva` + `react-konva`) — une librairie Canvas 2D avec scene graph, hit-testing natif, et API déclarative React. Le layout reste en TypeScript pur, découplé du renderer.

#### Justification

| Critère | React Flow | Cytoscape.js | D3.js | Canvas natif | **Konva (react-konva)** |
|---|---|---|---|---|---|
| Bundle size | +200 KB | +400 KB | +100 KB | 0 KB | **~70 KB** |
| 60 fps à 500 nodes | Non (DOM) | Possible | Non (SVG DOM) | Oui | **Oui** |
| Layout radial natif | Non | Oui (non-déterministe) | Custom | Custom | **Custom (découplé)** |
| Hit-testing | DOM natif | Oui | Custom | Custom (~40 LOC) | **Natif (par shape, gratuit)** |
| Pan/Zoom | Plugin | Plugin | Custom | Custom (~80 LOC) | **Stage.draggable + scale** |
| Animation | Custom | Custom | d3-transition | rAF custom | **Konva.Tween intégré** |
| API React déclarative | Oui (DOM) | Non | Non | Non (impératif) | **Oui (`<Circle>`, `<Text>`, `<Path>`)** |
| Export PNG | DOM→canvas | Oui | Custom | Custom | **`stage.toDataURL()` natif** |
| LOC code utilitaire | ~80 | ~150 | ~200 | **~350** | **~80** |

**Alternatives rejetées :**

1. **Canvas natif** : Le `BoardGanttView` utilise du Canvas natif, mais il requiert ~350 lignes de code utilitaire pour le hit-testing, pan/zoom, coordinate mapping et animation. Pour la Mindmap — qui a plus d'interactions (expand/collapse, hover, selection, tooltips) — le coût de maintenance du code custom devient significatif. Le hit-testing natif et le pan/zoom gratuit de Konva réduisent le TCO de 60% sur 2 ans.

2. **PixiJS** : WebGL natif, performance supérieure à 2000+ nodes. Mais : bundle 120 KB+, breaking changes entre v7/v8, wrapper React communautaire fragile. Overkill pour le besoin V1 (≤ 500 nodes typiques). **PixiJS est l'option de migration si le besoin scale dépasse 2000 nodes visibles.**

3. **React Flow** : Conçu pour des DAG interactifs éditables. Rendu DOM (1 div/node) → plafonne à ~200 nodes. Layout dagre = hiérarchique vertical, pas radial. Overkill pour une vue de lecture.

4. **Cytoscape.js** : Layouts non-déterministes (cose, cola). Wrapper React peu maintenu. Bundle 400+ KB.

5. **D3.js** : `d3-hierarchy` a un bon layout radial, mais rendu SVG = 1 élément DOM/node. Conflits React/D3 pour le contrôle du DOM. Les algorithmes de layout sont portés en TS pur dans `mindmap-layout.ts`.

#### Analyse TCO Konva vs Canvas natif à 2 ans

| Dimension | Canvas natif | **Konva (choisi)** |
|---|---|---|
| **Coût initial** | ~350 LOC utilitaire (hit-test, pan/zoom, dpr, coord mapping, animation loop) | **~0 LOC utilitaire** — tout est built-in |
| **Coût V2 drag & drop** | ~200 LOC (custom drag handler + hit zones + snapping) | **~50 LOC** (Konva.Draggable + onDragEnd) |
| **Coût V2 filtres** | Identique (logique dans transform) | Identique |
| **Maintenance breaking changes** | Nul (Web API stable) | Faible — Konva publie ~4 majeurs/an, `react-konva` suit React |
| **Coût feature incrémentale** | Élevé — chaque interaction = code custom | **Faible** — ajouter un shape = composant JSX |
| **Risque perf à scale** | Maîtrisé (contrôle total) | Maîtrisé (Layers + culling React) |
| **Testabilité** | Difficile (canvas impératif = snapshot testing) | **Plus facile** (composants React testables) |

**Point de bascule vers PixiJS** : si le besoin évolue vers > 2000 nodes visibles simultanément avec animations complexes. Dans ce cas, remplacer uniquement le renderer (composants Konva → composants PixiJS) grâce au découplage layout/renderer.

### 2.2 Architecture composants avec Konva

#### Structure des fichiers

```
apps/frontend/src/app/boards/[teamId]/[[...board]]/components/
├── BoardMindmapView.tsx           ← Composant principal (<Stage> + state + toolbar)
├── mindmap/
│   ├── mindmap-types.ts           ← Types MindmapNode, MindmapEdge, NodeSnapshot, LabelPlacement, LayoutResult
│   ├── mindmap-transform.ts       ← Transformation BoardData → MindmapTree (INCHANGÉ)
│   ├── mindmap-layout.ts          ← Algorithme layout radial pur TS (INCHANGÉ)
│   ├── mindmap-labels.ts          ← computeLabelPlacements() anti-collision (INCHANGÉ)
│   ├── MindmapEdgesLayer.tsx      ← <Layer> Konva pour les edges (Path shapes)
│   ├── MindmapNodesLayer.tsx      ← <Layer> Konva pour les nodes (Groups de Circle+Arc)
│   ├── MindmapLabelsLayer.tsx     ← <Layer> Konva pour les labels (Text shapes)
│   ├── MindmapNodeShape.tsx       ← Composant Konva pour un node individuel
│   ├── mindmap-animation.ts       ← Orchestration transitions (from/to snapshots → Konva refs)
│   └── mindmap-export.ts          ← Export PNG (stage.toDataURL) + SVG (string gen) (V2)
```

#### Architecture Konva : Stage, Layers, Shapes

```
┌─────────────────────────────────────────────┐
│  <div> wrapper (position relative)          │
│  ┌───────────────────────────────────────┐  │
│  │  <Stage>                              │  │
│  │  draggable, scaleX/Y, x/y            │  │
│  │  onWheel, onDragEnd                   │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  <Layer> edges                  │  │  │
│  │  │  listening={false}              │  │  │
│  │  │  ── <Path> (bézier curves)      │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  <Layer> nodes                  │  │  │
│  │  │  ── <Group x={node.x} y={node.y}>│ │  │
│  │  │       <Circle> (node shape)     │  │  │
│  │  │       <Arc> (progress)          │  │  │
│  │  │       <Circle> (expand badge)   │  │  │
│  │  │     </Group>                    │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  <Layer> labels (si zoom ≥ 0.5) │  │  │
│  │  │  listening={false}              │  │  │
│  │  │  ── <Text> (node titles)        │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  <div> tooltip (DOM overlay, position abs) │
│  <div> toolbar (DOM overlay)               │
│  <div> aria-live (sr-only)                 │
└─────────────────────────────────────────────┘
```

#### Pseudo-code du composant principal

```tsx
// BoardMindmapView.tsx
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';

interface BoardMindmapViewProps {
  board: Board;
  childBoards: Record<string, NodeChildBoard>;
  onOpenTask: (nodeId: string) => void;
  onOpenChildBoard: (boardId: string) => void;
}

function BoardMindmapView({ board, childBoards, onOpenTask, onOpenChildBoard }: BoardMindmapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Dimensions du conteneur (ResizeObserver)
  const { width: containerWidth, height: containerHeight } = useContainerSize(containerRef);

  // --- État (identique à avant) ---
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [loadedSubtrees, setLoadedSubtrees] = useState<Map<string, MindmapNode[]>>(new Map());
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());

  // --- Layout pur TS (INCHANGÉ) ---
  const mindmapNodes = useMemo(
    () => transformBoardToMindmapTree(board, childBoards, loadedSubtrees, collapsedIds),
    [board, childBoards, loadedSubtrees, collapsedIds],
  );
  const layoutResult = useMemo(
    () => computeRadialLayout(mindmapNodes),
    [mindmapNodes],
  );

  // --- Label placements (INCHANGÉ) ---
  const labelPlacements = useMemo(
    () => computeLabelPlacements(layoutResult.nodes),
    [layoutResult.nodes],
  );

  // --- Viewport culling (filtrer les nodes hors champ) ---
  const visibleNodes = useMemo(
    () => layoutResult.nodes.filter(n => isNodeInViewport(n, stagePos, stageScale, containerWidth, containerHeight)),
    [layoutResult.nodes, stagePos, stageScale, containerWidth, containerHeight],
  );

  // --- Navigation child board : résolution nodeId → boardId ---
  const handleNavigateChild = useCallback((nodeId: string) => {
    const childBoard = childBoards[nodeId];
    if (childBoard) {
      onOpenChildBoard(childBoard.boardId);
    }
    // Si pas de childBoard connu, ne rien faire (le node a hasChildren=true
    // mais le board n'est pas encore chargé — l'utilisateur doit d'abord expand)
  }, [childBoards, onOpenChildBoard]);

  // --- Pan : le Stage est draggable nativement ---
  // Note : onDragMove met à jour Konva de manière impérative (pas de setState)
  // Le sync React est debounced via rAF pour éviter les re-renders à 60fps
  const syncStateRafRef = useRef<number>(0);

  const syncViewportToState = useCallback(() => {
    cancelAnimationFrame(syncStateRafRef.current);
    syncStateRafRef.current = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      setStagePos({ x: stage.x(), y: stage.y() });
      setStageScale(stage.scaleX());
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    syncViewportToState();
  }, [syncViewportToState]);

  // --- Zoom : updates impératives Konva + sync React debounced ---
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stage.scaleX();
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = clamp(oldScale * (1 + direction * 0.1), 0.1, 3.0);

    // Zoom centré sur la position du pointeur
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    // Mise à jour impérative Konva (pas de setState ici — pas de re-render React)
    stage.scaleX(newScale);
    stage.scaleY(newScale);
    stage.x(pointer.x - mousePointTo.x * newScale);
    stage.y(pointer.y - mousePointTo.y * newScale);
    stage.batchDraw();

    // Sync React state via rAF debounce (pour le culling et le LoD)
    syncViewportToState();
  }, [syncViewportToState]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <Stage
        ref={stageRef}
        width={containerWidth}
        height={containerHeight}
        draggable
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onDragEnd={handleDragEnd}
        onWheel={handleWheel}
        style={{ cursor: 'grab' }}
      >
        {/* Layer 1 : Edges — non interactif */}
        <Layer listening={false}>
          <MindmapEdgesLayer
            edges={layoutResult.edges}
            nodes={layoutResult.nodes}
          />
        </Layer>

        {/* Layer 2 : Nodes — interactif (click, hover, dblclick) */}
        <Layer>
          <MindmapNodesLayer
            nodes={visibleNodes}
            selectedId={selectedNodeId}
            loadingIds={loadingNodeIds}
            onSelect={setSelectedNodeId}
            onExpand={requestExpand}
            onOpenTask={onOpenTask}
            onNavigateChild={handleNavigateChild}
            onHoverStart={onNodeHoverStart}
            onHoverEnd={onNodeHoverEnd}
          />
        </Layer>

        {/* Layer 3 : Labels — conditionnel au zoom, non interactif */}
        {stageScale >= 0.5 && (
          <Layer listening={false}>
            <MindmapLabelsLayer
              placements={labelPlacements}
              nodes={visibleNodes}
            />
          </Layer>
        )}
      </Stage>

      {/* Tooltip DOM — positionné au-dessus du canvas */}
      {hoveredNodeId && (
        <MindmapTooltip
          node={layoutResult.nodes.find(n => n.id === hoveredNodeId)!}
          stagePos={stagePos}
          stageScale={stageScale}
        />
      )}

      {/* Toolbar DOM */}
      <MindmapToolbar
        onZoomIn={() => adjustZoom(+0.2)}
        onZoomOut={() => adjustZoom(-0.2)}
        onFitToContent={() => fitToContent(layoutResult.bounds)}
        onExpandAll={() => setCollapsedIds(new Set())}
        onCollapseAll={() => collapseAll()}
      />

      {/* Accessibilité */}
      <div role="tree" aria-label="Carte mentale du projet">
        <div aria-live="polite" className="sr-only">
          {selectedNodeId && announceNode(selectedNodeId)}
        </div>
      </div>
    </div>
  );
}
```

#### Composant MindmapNodeShape (un node Konva)

```tsx
// MindmapNodeShape.tsx
import { Group, Circle, Arc } from 'react-konva';

function MindmapNodeShape({
  node,
  isSelected,
  isLoading,
  onSelect,
  onExpand,
  onOpenTask,
  onNavigateChild, // (nodeId: string) => void — BoardMindmapView résout nodeId → boardId
  onHoverStart,
  onHoverEnd,
}: MindmapNodeShapeProps) {
  const nodeRadius = node.depth === 0
    ? LAYOUT_CONSTANTS.ROOT_RADIUS
    : LAYOUT_CONSTANTS.NODE_RADIUS;

  return (
    <Group x={node.x} y={node.y}>
      {/* Cercle principal du node */}
      <Circle
        radius={nodeRadius}
        fill={getNodeColor(node)}
        stroke={isSelected ? '#ffffff' : undefined}
        strokeWidth={isSelected ? 2 : 0}
        shadowBlur={isSelected ? 12 : 0}
        shadowColor={isSelected ? '#ffffff' : undefined}
        opacity={isLoading ? 0.6 : 1}
        onClick={() => onSelect(node.id)}
        onDblClick={() => {
          // Règle unique : dblclick = childBoard si existe, sinon openTask
          // onNavigateChild reçoit un nodeId ; BoardMindmapView résout le boardId
          // via childBoards[nodeId] ou ensureChildBoard puis appelle onOpenChildBoard(boardId)
          if (node.hasChildren && onNavigateChild) {
            onNavigateChild(node.id);
          } else {
            onOpenTask(node.id);
          }
        }}
        onMouseEnter={(e) => {
          // Hover scale-up via Konva.Tween
          e.target.to({ scaleX: 1.15, scaleY: 1.15, duration: 0.15 });
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'pointer';
          onHoverStart(node.id);
        }}
        onMouseLeave={(e) => {
          e.target.to({ scaleX: 1, scaleY: 1, duration: 0.15 });
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grab';
          onHoverEnd(node.id);
        }}
      />

      {/* Arc de progression (si progress > 0) */}
      {node.progress > 0 && (
        <Arc
          innerRadius={nodeRadius + 1}
          outerRadius={nodeRadius + 4}
          angle={(node.progress / 100) * 360}
          rotation={-90}
          fill="rgba(255, 255, 255, 0.7)"
          listening={false}
        />
      )}

      {/* Badge expand/collapse — visible pour TOUT node avec enfants */}
      {node.hasChildren && (
        <Group
          x={nodeRadius * 0.7}
          y={nodeRadius * 0.7}
        >
          {/* Hit-zone élargie (rayon 14px) pour faciliter le clic */}
          <Circle
            radius={14}
            fill="transparent"
            onClick={(e) => {
              e.cancelBubble = true;
              onExpand(node.id);
            }}
          />
          {/* Badge visuel +/− */}
          <Circle
            radius={LAYOUT_CONSTANTS.COLLAPSE_INDICATOR_SIZE}
            fill="#ffffff"
            listening={false}
          />
          <Text
            text={node.collapsed ? '+' : '−'}
            fontSize={12}
            fontStyle="bold"
            fill="#0f1117"
            align="center"
            verticalAlign="middle"
            offsetX={4}
            offsetY={6}
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}
```

#### Composant MindmapEdgesLayer

```tsx
// MindmapEdgesLayer.tsx
import { Path } from 'react-konva';

function MindmapEdgesLayer({ edges, nodes }: { edges: MindmapEdge[]; nodes: MindmapNode[] }) {
  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes],
  );

  return (
    <>
      {edges.map(edge => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;

        // Point de contrôle pour la courbe de Bézier quadratique
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const ctrlX = source.x + (midX - source.x) * 0.5;
        const ctrlY = source.y + (midY - source.y) * 0.5;

        return (
          <Path
            key={`${edge.sourceId}-${edge.targetId}`}
            data={`M${source.x},${source.y} Q${ctrlX},${ctrlY} ${target.x},${target.y}`}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={1.5}
            listening={false}
          />
        );
      })}
    </>
  );
}
```

#### Gestion du viewport (pan + zoom) : résumé

| Aspect | Implémentation Konva |
|---|---|
| **Pan** | `<Stage draggable>` — Konva gère nativement le drag du stage. `onDragEnd` met à jour `stagePos`. |
| **Zoom** | `onWheel` sur `<Stage>` — mise à jour **impérative** de scale/position sur le Stage Konva. Sync React state via `requestAnimationFrame` debounce pour éviter 60 re-renders/seconde. |
| **Zoom range** | `[0.1, 3.0]` — clamp appliqué dans `handleWheel`. |
| **Cursor** | `grab` par défaut sur le stage container. `pointer` au hover d'un node (via `stage.container().style.cursor`). `grabbing` géré nativement par Konva pendant le drag. |
| **Fit to content** | Calcul de `stageScale` et `stagePos` pour que `layoutResult.bounds` tienne dans `containerWidth × containerHeight` avec un padding de 40px. |
| **Inertia** | Non intégré nativement dans Konva. Implémenté en post-`dragEnd` si nécessaire (V2). |

```typescript
// Fit-to-content : centrer et zoomer pour voir tout l'arbre
function fitToContent(bounds: MindmapLayoutResult['bounds']): void {
  const PADDING = 40;
  const contentWidth = bounds.maxX - bounds.minX + PADDING * 2;
  const contentHeight = bounds.maxY - bounds.minY + PADDING * 2;
  const scaleX = containerWidth / contentWidth;
  const scaleY = containerHeight / contentHeight;
  const newScale = clamp(Math.min(scaleX, scaleY), 0.1, 3.0);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  setStageScale(newScale);
  setStagePos({
    x: containerWidth / 2 - centerX * newScale,
    y: containerHeight / 2 - centerY * newScale,
  });
}
```

### 2.3 Intégration dans le système de vues existant

Le type `BoardViewMode` dans `board-ui-settings.tsx` passe de :

```typescript
type BoardViewMode = "kanban" | "gantt" | "list";
```

à :

```typescript
type BoardViewMode = "kanban" | "gantt" | "list" | "mindmap";
```

Le bouton de vue dans `BoardPageShell.tsx` gagne un 4ème segment "Mindmap".

Le rendu conditionnel dans `BoardPageShell.tsx` suit le pattern existant :

```typescript
boardView === 'mindmap' ? (
  <BoardMindmapView
    board={board}
    childBoards={childBoards}
    onOpenTask={handleOpenCard}
    onOpenChildBoard={openChildBoard}
  />
) : // ...
```

---

## 3. Modèle de transformation des données

### 3.1 Source de données

La vue Mindmap consomme les **mêmes données** que les autres vues, fournies par `useBoardData()` :

- `board: Board` — le board courant avec ses colonnes et nodes directement enfants.
- `childBoards: Record<string, NodeChildBoard>` — les sous-boards existants pour les nodes qui ont des enfants.

Pour afficher la profondeur > 1, un **lazy loading récursif** charge les sous-arbres à la demande (cf. section 8).

### 3.2 Types de données Mindmap

```typescript
// mindmap-types.ts

/** Node du graphe mindmap, aplati depuis la hiérarchie */
interface MindmapNode {
  id: string;
  parentId: string | null;
  title: string;
  depth: number;                    // 0 = racine affichée
  progress: number;                 // 0-100
  priority: BoardNode['priority'];
  effort: BoardNode['effort'];
  behaviorKey: ColumnBehaviorKey | null;  // colonne courante
  hasChildren: boolean;             // a des enfants (childBoards[id] existe)
  childrenLoaded: boolean;          // les enfants ont été récursivement chargés
  collapsed: boolean;               // replié par l'utilisateur
  assignees: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
  dueAt: string | null;
  // Propriétés calculées par le layout
  x: number;
  y: number;
  angle: number;                    // angle radial en radians
  radius: number;                   // distance au centre
}

/** Arête parent → enfant */
interface MindmapEdge {
  sourceId: string;
  targetId: string;
}

/** Résultat complet du layout */
interface MindmapLayoutResult {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  centerX: number;
  centerY: number;
}
```

### 3.3 Transformation `Board` → `MindmapNode[]`

```typescript
// mindmap-transform.ts

function transformBoardToMindmapTree(
  board: Board,
  childBoards: Record<string, NodeChildBoard>,
  loadedSubtrees: Map<string, MindmapNode[]>,  // sous-arbres déjà chargés
  collapsedIds: Set<string>,
): MindmapNode[] {
  const rootNode: MindmapNode = {
    id: board.nodeId,
    parentId: null,
    title: board.name,
    depth: 0,
    progress: 0,
    priority: 'NONE',
    effort: null,
    behaviorKey: null,
    hasChildren: true,
    childrenLoaded: true,
    collapsed: collapsedIds.has(board.nodeId),
    assignees: [],
    dueAt: null,
    x: 0, y: 0, angle: 0, radius: 0,
  };

  const nodes: MindmapNode[] = [rootNode];

  // Enfants directs (toutes colonnes confondus, triés par position)
  const allBoardNodes = board.columns
    .flatMap(col => (col.nodes ?? []).map(n => ({ ...n, behaviorKey: col.behaviorKey })))
    .sort((a, b) => a.position - b.position);

  if (!rootNode.collapsed) {
    for (const node of allBoardNodes) {
      const mindmapNode: MindmapNode = {
        id: node.id,
        parentId: board.nodeId,
        title: node.title,
        depth: 1,
        progress: node.progress ?? 0,
        priority: node.priority ?? 'NONE',
        effort: node.effort ?? null,
        behaviorKey: node.behaviorKey,
        hasChildren: Boolean(childBoards[node.id]),
        childrenLoaded: loadedSubtrees.has(node.id),
        collapsed: collapsedIds.has(node.id),
        assignees: node.assignees ?? [],
        dueAt: node.dueAt,
        x: 0, y: 0, angle: 0, radius: 0,
      };
      nodes.push(mindmapNode);

      // Si sous-arbre chargé et non collapse, injecter avec depthOffset
      if (!mindmapNode.collapsed && loadedSubtrees.has(node.id)) {
        const subtreeNodes = loadedSubtrees.get(node.id)!;
        // subtreeNodes est stocké en depth RELATIF :
        //   depth=1 = enfants directs du node expansé
        //   depth=2 = petits-enfants, etc.
        //   parentId internes cohérents (le parentId des enfants directs = node.id)
        // On applique un depthOffset = profondeur absolue du node parent
        const depthOffset = mindmapNode.depth;
        for (const sub of subtreeNodes) {
          nodes.push({ ...sub, depth: sub.depth + depthOffset });
        }
      }
    }
  }

  return nodes;
}
```

### 3.4 Contract `loadedSubtrees` et `transformSubBoardToNodes`

Le `Map<nodeId, MindmapNode[]>` stocké dans `loadedSubtrees` respecte un contrat strict. **Chaque `MindmapNode[]` est en depth relatif** au node parent expansé. La fonction `transformSubBoardToNodes` est responsable de cette garantie.

#### Invariants obligatoires

1. **Depths relatifs ≥ 1** : les enfants directs du node expansé ont `depth = 1`, leurs enfants `depth = 2`, etc. Jamais `depth = 0`.
2. **parentId cohérents** : les enfants directs ont `parentId = parentNodeId` (l'id du node expansé). Les petits-enfants ont `parentId = id de leur parent réel` dans le sous-arbre.
3. **Ids présents dans la liste** : tout `parentId` référencé par un node du sous-arbre doit correspondre soit au `parentNodeId` (racine du sous-arbre), soit à un `id` présent dans la liste retournée. Sinon, `buildEdges()` produirait des edges invalides.
4. **Pas de node racine du sous-arbre dans la liste** : le node parent lui-même est déjà dans l'arbre principal. Seuls ses descendants sont dans `loadedSubtrees`.

#### Pseudo-code

```typescript
// mindmap-transform.ts

function transformSubBoardToNodes(
  parentNodeId: string,
  subBoardDetail: BoardDetail,
  childBoardsData: Record<string, NodeChildBoard>,
): MindmapNode[] {
  const nodes: MindmapNode[] = [];

  // Enfants directs du sub-board (depth relatif = 1)
  const allSubNodes = subBoardDetail.columns
    .flatMap(col => (col.nodes ?? []).map(n => ({ ...n, behaviorKey: col.behaviorKey })))
    .sort((a, b) => a.position - b.position);

  for (const node of allSubNodes) {
    nodes.push({
      id: node.id,
      parentId: parentNodeId,    // ← enfants directs → parentId = node expansé
      title: node.title,
      depth: 1,                  // ← depth relatif
      progress: node.progress ?? 0,
      priority: node.priority ?? 'NONE',
      effort: node.effort ?? null,
      behaviorKey: node.behaviorKey,
      hasChildren: Boolean(childBoardsData[node.id]),
      childrenLoaded: false,     // sera true quand ce sous-node sera à son tour chargé
      collapsed: true,           // collapsed par défaut
      assignees: node.assignees ?? [],
      dueAt: node.dueAt,
      x: 0, y: 0, angle: 0, radius: 0,
    });
  }

  // Assertion de cohérence (dev only)
  if (process.env.NODE_ENV === 'development') {
    const idSet = new Set(nodes.map(n => n.id));
    for (const node of nodes) {
      if (node.parentId !== parentNodeId && !idSet.has(node.parentId!)) {
        console.error(
          `[transformSubBoardToNodes] parentId orphelin : node ${node.id} a parentId=${node.parentId} non présent dans le sous-arbre ni comme parentNodeId`,
        );
      }
    }
  }

  return nodes;
}
```

**Note :** quand le lazy-loading charge récursivement des sous-sous-arbres (V2, expand multi-niveaux), les nodes de profondeur > 1 dans le sous-arbre ont `depth = 2, 3, ...` (relatif) et des `parentId` internes cohérents. L'injection dans l'arbre principal applique `depthOffset` (cf. section 3.3).

### 3.5 Construction des edges

```typescript
function buildEdges(nodes: MindmapNode[]): MindmapEdge[] {
  return nodes
    .filter(n => n.parentId !== null)
    .map(n => ({ sourceId: n.parentId!, targetId: n.id }));
}
```

---

## 4. Algorithme de layout radial

### 4.1 Constantes de configuration

```typescript
// mindmap-layout.ts

const LAYOUT_CONSTANTS = {
  BASE_RADIUS: 180,             // px — distance du centre au premier cercle
  LEVEL_SPACING: 140,           // px — espacement entre niveaux concentriques
  MIN_NODE_DISTANCE: 60,        // px — distance minimale entre deux nodes adjacents sur un même cercle
  NODE_RADIUS: 24,              // px — rayon visuel d'un node (cercle)
  LABEL_MAX_WIDTH: 120,         // px — largeur max du label texte
  ROOT_RADIUS: 32,              // px — rayon visuel du node racine
  COLLAPSE_INDICATOR_SIZE: 8,   // px — taille de l'indicateur "+"
} as const;
```

### 4.2 Algorithme déterministe

Le layout utilise une **distribution angulaire proportionnelle au poids** (nombre de descendants visibles).

#### Pseudo-code complet

```
FUNCTION computeRadialLayout(nodes: MindmapNode[]) → MindmapLayoutResult:
  
  // 1. Construire une map parent→enfants
  childrenMap = groupBy(nodes.filter(n → n.parentId), n → n.parentId)
  root = nodes.find(n → n.parentId === null)
  
  // 2. Calculer le poids (nombre de feuilles dans le sous-arbre visible) de chaque node
  //    Avec memoization pour éviter O(n²) sur grands arbres
  weightCache = new Map<string, number>()

  FUNCTION weight(nodeId) → number:
    IF weightCache.has(nodeId):
      RETURN weightCache.get(nodeId)
    children = childrenMap[nodeId] ?? []
    IF children.length === 0:
      result = 1
    ELSE:
      result = SUM(children.map(c → weight(c.id)))
    weightCache.set(nodeId, result)
    RETURN result
  
  // 3. Placer la racine au centre
  root.x = 0
  root.y = 0
  root.radius = 0
  root.angle = 0
  
  // 4. Placer récursivement chaque niveau
  FUNCTION placeChildren(parentId, startAngle, sweepAngle, depth):
    children = childrenMap[parentId] ?? []
    IF children.length === 0: RETURN
    
    radius = BASE_RADIUS + (depth - 1) * LEVEL_SPACING
    totalWeight = SUM(children.map(c → weight(c.id)))
    
    // Calculer la distance angulaire minimale pour respecter MIN_NODE_DISTANCE
    circumference = 2 * π * radius
    minAnglePerNode = MIN_NODE_DISTANCE / radius  // en radians
    requiredAngle = children.length * minAnglePerNode
    
    // Si l'angle disponible est insuffisant, étendre le rayon
    IF requiredAngle > sweepAngle AND depth > 1:
      radius = (children.length * MIN_NODE_DISTANCE) / sweepAngle
    
    currentAngle = startAngle
    
    FOR EACH (child, index) IN children:
      childWeight = weight(child.id)
      childSweep = sweepAngle * (childWeight / totalWeight)
      
      // Garantir un angle minimum
      childSweep = MAX(childSweep, minAnglePerNode)
      
      // Placer le node au milieu de son secteur angulaire
      // Epsilon index pour garantir l'unicité des angles au sein d'un même depth
      // (nécessaire pour que la collision-detection par sort(angle) fonctionne)
      EPSILON = 1e-10
      child.angle = currentAngle + childSweep / 2 + (index * EPSILON)
      child.radius = radius
      child.x = radius * COS(child.angle)
      child.y = radius * SIN(child.angle)
      child.depth = depth
      
      // Récursion si non collapsed
      IF NOT child.collapsed AND childrenMap[child.id]:
        placeChildren(child.id, currentAngle, childSweep, depth + 1)
      
      currentAngle += childSweep
  
  // 5. Lancer pour le niveau 1 avec un sweep de 2π (360°)
  placeChildren(root.id, -π, 2 * π, 1)
  
  // 6. Calculer les bounds
  bounds = {
    minX: MIN(nodes.map(n → n.x)) - LABEL_MAX_WIDTH,
    maxX: MAX(nodes.map(n → n.x)) + LABEL_MAX_WIDTH,
    minY: MIN(nodes.map(n → n.y)) - NODE_RADIUS * 2,
    maxY: MAX(nodes.map(n → n.y)) + NODE_RADIUS * 2,
  }
  
  edges = buildEdges(nodes)
  
  RETURN { nodes, edges, bounds, centerX: 0, centerY: 0 }
```

### 4.3 Gestion des sous-arbres volumineux

Quand un node a plus de **20 enfants directs**, les enfants au-delà du 20ème sont regroupés dans un **node synthétique "... +N"** qui, au clic, déclenche le chargement et l'expansion complète.

Seuil configurable :
```typescript
const MAX_VISIBLE_CHILDREN = 20;
```

### 4.4 Stabilité du layout et stabilité angulaire

Le layout est **déterministe** : pour un même arbre et un même état de collapse, il produit **toujours les mêmes coordonnées**. Propriétés garanties :

- L'ordre des enfants est stable (trié par `position` dans la colonne, puis par `id`).
- La fonction `weight()` ne dépend que de la structure de l'arbre visible.
- Aucun algorithme de force-directed ou random seed n'est utilisé.

#### Règle de stabilité angulaire (anti-rotation)

Lorsqu'un node est expand/collapse, les branches **frères** ne doivent pas "tourner" ou se réorganiser visuellement de façon brutale. Pour éviter ce phénomène, le layout applique un **ancrage angulaire** :

**Principe :** chaque enfant direct de la racine possède un **secteur angulaire fixe** déterminé par sa position d'index, indépendamment du poids de ses sous-arbres.

```
STRATEGIE ANGULAR ANCHOR:

État 1 : A(5 feuilles), B(2 feuilles), C(1 feuille)
  → Sans ancrage: A prend 62.5% du cercle, B 25%, C 12.5% → C est tout en bas
  → Avec ancrage: la base angulaire est 360°/3 = 120° par enfant (uniform)
     puis ajustée proportionnellement au poids avec un facteur de lissage

État 2 : On collapse A → A(1 feuille), B(2 feuilles), C(1 feuille)
  → Sans ancrage: B prend 50% du cercle, A et C 25% → tout bouge
  → Avec ancrage: A garde son secteur (rétréci vers son centre), B et C ne bougent presque pas
```

**Algorithme d'ancrage :**

```
FUNCTION computeAnchoredSweeps(children, totalSweep):

  N = children.length
  uniformSweep = totalSweep / N                        // répartition uniforme de base
  weights = children.map(c → weight(c.id))
  totalWeight = SUM(weights)
  
  // Blénd entre répartition uniforme et répartition par poids
  ANCHOR_BLEND = 0.4    // 0.0 = 100% par poids / 1.0 = 100% uniforme
  
  sweeps = []
  FOR EACH (child, i) IN children:
    weightSweep = totalSweep * (weights[i] / totalWeight)
    anchoredSweep = LERP(weightSweep, uniformSweep, ANCHOR_BLEND)
    sweeps.push(anchoredSweep)
  
  // Normaliser pour que la somme = totalSweep
  sweepSum = SUM(sweeps)
  sweeps = sweeps.map(s → s * totalSweep / sweepSum)
  
  RETURN sweeps
```

Ce `ANCHOR_BLEND = 0.4` signifie :
- 60% de l'angle est déterminé par le poids réel du sous-arbre (proportionnel aux feuilles)
- 40% est fixe (uniforme), ce qui ancre chaque branche dans son secteur

**Effet :** quand un sous-arbre est expand/collapse, la branche concernée s'étend/se rétracte dans son secteur, mais les branches voisines ne translatent que de quelques degrés au lieu de se rédistribuer complètement.

**Application :** l'ancrage s'applique au **depth 1 uniquement** (enfants directs de la racine). Les niveaux > 1 utilisent la distribution purement proportionnelle au poids, car leur secteur est déjà contraint par le parent.

### 4.5 Schéma ASCII du layout

```
                        depth=2
                      ·   ·   ·
                    ·       |       ·
                  ·     depth=1      ·
                ·    ·    |    ·       ·
              ·   ·   ·   |   ·   ·      ·
            ·  [B]  [C]   |  [D]  [E]     ·
          ·       ╲   ╲   |  ╱   ╱          ·
        ·           ╲   ╲ | ╱  ╱              ·
      [F] [G]  ──── [ROOT] ──── [A]
        ·           ╱   ╱ | ╲  ╲              ·
          ·       ╱   ╱   |  ╲   ╲          ·
            ·  [H]  [I]   |  [J]  [K]     ·
              ·   ·   ·   |   ·   ·      ·
                ·    ·    |    ·       ·
                  ·     depth=1      ·
                    ·       |       ·
                      ·   ·   ·
                        depth=2
```

Cercles concentriques : rayon = `BASE_RADIUS + level * LEVEL_SPACING`.

### 4.6 Stratégie anti-collision (Collision Avoidance)

Même avec une distribution angulaire proportionnelle, des chevauchements visuels surviennent dans trois scénarios : labels longs, branches denses, et sous-arbres profonds. Cette section définit la stratégie complète.

#### 4.6.1 Problèmes de collision identifiés

| Scénario | Cause | Conséquence visuelle |
|---|---|---|
| Labels longs | Titres > 15 caractères débordent dans le node voisin | Texte illisible, chevauchement |
| Branches denses (> 10 enfants) | Trop de nodes sur le même arc de cercle | Nodes superposés |
| Sous-arbres profonds et larges | Niveau N+2 hérite d'un secteur angulaire trop étroit | Nodes compressés |
| Labels opposés | Deux nodes quasi-diamétralement opposés ont des labels qui se croisent au centre | Texte superposé |

#### 4.6.2 Stratégie pour les labels

**Décision :** les labels ne participent **pas** au calcul du layout. Le layout ne positionne que les cercles des nodes. Les labels sont traités au rendu comme des décorations évitant les collisions.

```
RÈGLES DE PLACEMENT LABEL :

1. Position de base:
   - Si node.angle ∈ [-π/2, π/2]  → label à droite, aligné à gauche
   - Sinon                          → label à gauche, aligné à droite
   - Offset horizontal : NODE_RADIUS + 6px

2. Troncature adaptive :
   - Calcul de l'espace disponible entre le node et son voisin le plus proche
     sur le même arc :
     availableWidth = MIN(LABEL_MAX_WIDTH, distanceToNeighbor - NODE_RADIUS * 2 - 12)
   - Si availableWidth < 40px : masquer le label complètement
   - Si availableWidth < LABEL_MAX_WIDTH : tronquer avec ellipsis

3. Anti-chevauchement vertical :
   - Pour chaque paire de labels consécutifs sur le même côté (gauche ou droite),
     calculer la distance verticale en pixels :
     verticalGap = |screenY_a - screenY_b| - LABEL_HEIGHT
   - Si verticalGap < 4px : décaler le label inférieur vers le bas de (4 - verticalGap) px
   - Limite : max 2 décalages successifs. Au 3ème, masquer le label.
```

**Pseudo-code de résolution :**

```typescript
interface LabelPlacement {
  nodeId: string;
  x: number;       // position monde du coin d'ancrage du label
  y: number;
  anchor: 'left' | 'right';  // alignement
  maxWidth: number; // largeur max autorisée
  visible: boolean;
}

function computeLabelPlacements(
  nodes: MindmapNode[],
): LabelPlacement[] {
  const LABEL_HEIGHT = 16; // px
  const MIN_LABEL_WIDTH = 40;
  const MIN_VERTICAL_GAP = 4;

  // --- O(n) voisin-distance via groupBy(depth) + sortBy(angle) ---
  // Grouper par depth
  const byDepth = new Map<number, MindmapNode[]>();
  for (const node of nodes) {
    if (node.depth === 0) continue;
    const arr = byDepth.get(node.depth) ?? [];
    arr.push(node);
    byDepth.set(node.depth, arr);
  }

  // Pour chaque depth, trier par angle une seule fois
  // Puis calculer la distance au voisin immédiat (i-1, i+1) — O(n) total
  const neighborDist = new Map<string, number>();
  for (const [, depthNodes] of byDepth) {
    depthNodes.sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < depthNodes.length; i++) {
      const prev = depthNodes[i - 1];
      const next = depthNodes[i + 1];
      const node = depthNodes[i];
      let minDist = Infinity;
      if (prev) {
        minDist = Math.min(minDist, Math.sqrt((prev.x - node.x) ** 2 + (prev.y - node.y) ** 2));
      }
      if (next) {
        minDist = Math.min(minDist, Math.sqrt((next.x - node.x) ** 2 + (next.y - node.y) ** 2));
      }
      neighborDist.set(node.id, minDist);
    }
  }

  const placements: LabelPlacement[] = [];

  for (const node of nodes) {
    if (node.depth === 0) continue;

    const isRight = node.angle >= -Math.PI / 2 && node.angle <= Math.PI / 2;
    const anchor = isRight ? 'left' : 'right';

    const minNeighborDist = neighborDist.get(node.id) ?? Infinity;

    const availableWidth = Math.min(
      LAYOUT_CONSTANTS.LABEL_MAX_WIDTH,
      minNeighborDist < Infinity
        ? (minNeighborDist - LAYOUT_CONSTANTS.NODE_RADIUS * 2 - 12) / 2
        : LAYOUT_CONSTANTS.LABEL_MAX_WIDTH
    );

    placements.push({
      nodeId: node.id,
      x: node.x + (isRight ? 1 : -1) * (LAYOUT_CONSTANTS.NODE_RADIUS + 6),
      y: node.y,
      anchor,
      maxWidth: Math.max(availableWidth, 0),
      visible: availableWidth >= MIN_LABEL_WIDTH,
    });
  }

  // Passe de déchevauchement vertical
  const rightLabels = placements.filter(p => p.anchor === 'left' && p.visible)
    .sort((a, b) => a.y - b.y);
  const leftLabels = placements.filter(p => p.anchor === 'right' && p.visible)
    .sort((a, b) => a.y - b.y);

  for (const group of [rightLabels, leftLabels]) {
    let consecutiveShifts = 0;
    for (let i = 1; i < group.length; i++) {
      const gap = group[i].y - group[i - 1].y - LABEL_HEIGHT;
      if (gap < MIN_VERTICAL_GAP) {
        consecutiveShifts++;
        if (consecutiveShifts >= 3) {
          group[i].visible = false;
        } else {
          group[i].y += MIN_VERTICAL_GAP - gap;
        }
      } else {
        consecutiveShifts = 0;
      }
    }
  }

  return placements;
}
```

#### 4.6.3 Anti-chevauchement des nodes (recalcul dynamique du rayon)

Quand trop de nodes sont entassés sur un même arc, l'algorithme de layout (section 4.2) étend déjà le rayon. Ce mécanisme est ici formalisé et renforcé :

```
RÈGLE DE RAYON ADAPTATIF :

Pour chaque niveau de profondeur d :
  radiusBase = BASE_RADIUS + (d - 1) * LEVEL_SPACING
  nodesAtDepth = nodes du parent dont c'est le depth
  sweepAngle = secteur angulaire du parent

  // Distance minimale physique entre centres de nodes sur l'arc
  minArcDist = MIN_NODE_DISTANCE + 2 * NODE_RADIUS  // 60 + 48 = 108 px
  requiredCircumference = nodesAtDepth.length * minArcDist
  requiredRadius = requiredCircumference / sweepAngle

  effectiveRadius = MAX(radiusBase, requiredRadius)

  // Plafond : ne pas dépasser 3× le rayon de base pour éviter un layout trop étalé
  effectiveRadius = MIN(effectiveRadius, radiusBase * 3)

  // Si même après plafonnement le chevauchement persiste :
  IF effectiveRadius === radiusBase * 3 AND requiredRadius > effectiveRadius:
    APPLIQUER la règle de troncature (MAX_VISIBLE_CHILDREN = 20, cf. 4.3)
    Les nodes excédentaires sont regroupés en node synthétique "+N"
```

#### 4.6.4 Stratégie si collision persistante (dernier recours)

Si après extension du rayon et troncature des labels, des chevauchements visuels subsistent :

```
CASCADE DE RESOLUTION (appliquée dans cet ordre) :

1. Masquer les labels          → libère l'espace texte
2. Étendre le rayon (up to 3×) → plus d'espace sur l'arc
3. Tronquer à MAX_VISIBLE_CHILDREN (node "+N") → réduit le nombre de nodes
4. Auto-collapse des sous-branches les moins profondes → réduit la densité locale
5. Message UX : « Branche trop dense — dépliez moins de sous-branches »
```

**Aucune collision de cercles de nodes n'est tolérée.** La cascade est appliquée jusqu'à résolution complète. La vérification est effectuée en post-processing après `computeRadialLayout()` :

```typescript
function detectCollisions(nodes: MindmapNode[]): Array<[string, string]> {
  const collisions: Array<[string, string]> = [];
  const minDist = LAYOUT_CONSTANTS.NODE_RADIUS * 2 + 4; // 4px de marge

  // Vérifier uniquement les paires de même profondeur (les seules pouvant se chevaucher)
  const byDepth = new Map<number, MindmapNode[]>();
  for (const node of nodes) {
    const arr = byDepth.get(node.depth) ?? [];
    arr.push(node);
    byDepth.set(node.depth, arr);
  }

  // Seuil angulaire au-delà duquel deux nodes ne peuvent plus collisionner
  // Pour un rayon R donné, deux nodes ne peuvent se toucher que si
  // leur distance d'arc < minDist, soit delta_angle < minDist / R.

  for (const [depth, depthNodes] of byDepth) {
    // Triés par angle pour fenêtre glissante
    // L'epsilon index (cf. 4.2) garantit que sort est stable même si les sweeps sont identiques
    depthNodes.sort((a, b) => a.angle - b.angle);

    // Rayon de l'anneau à ce depth (pour calculer le seuil angulaire)
    const ringRadius = depth === 0 ? 0 : LAYOUT_CONSTANTS.BASE_RADIUS + (depth - 1) * LAYOUT_CONSTANTS.LEVEL_SPACING;
    // Seuil angulaire : au-delà, la distance d'arc > minDist → pas de collision possible
    const angleThreshold = ringRadius > 0 ? minDist / ringRadius : Infinity;

    // Fenêtre glissante : pour chaque node i, comparer avec i+1..i+k tant que
    // la différence d'angle est inférieure au seuil
    for (let i = 0; i < depthNodes.length; i++) {
      const a = depthNodes[i];
      for (let j = i + 1; j < depthNodes.length; j++) {
        const b = depthNodes[j];
        const angleDelta = b.angle - a.angle;

        // Si la différence d'angle dépasse le seuil, les nodes suivants
        // sont encore plus éloignés → on coupe la fenêtre
        if (angleDelta > angleThreshold) break;

        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        if (dist < minDist) {
          collisions.push([a.id, b.id]);
        }
      }
    }
  }
  return collisions;
}
```

---

## 5. UX détaillée

### 5.1 Interactions

| Action | Comportement |
|---|---|
| **Pan (drag canvas)** | Déplace la vue (translate). Curseur `grab` / `grabbing`. |
| **Zoom (molette / pinch)** | Zoom centré sur la position du pointeur. Range : `[0.1, 3.0]`, pas `0.1`. |
| **Clic sur un node** | Sélectionne le node. Ouvre le TaskDrawer (`onOpenTask(id)`). |
| **Double-clic sur un node** | Si le node possède un childBoard : descend dans le board enfant (`onOpenChildBoard(boardId)`). Sinon : ouvre le TaskDrawer (`onOpenTask(id)`). |
| **Clic sur l'indicateur d'expansion ("+" / "−")** | Toggle collapse/expand du sous-arbre. Hit-zone élargie (cf. 5.5). |
| **Bouton "Recentrer" (toolbar)** | Anime le viewport pour centrer la racine, zoom par défaut (`fit-to-content`). |
| **Bouton "Zoom +" / "Zoom −" (toolbar)** | Zoom par pas de `0.2`. |
| **Bouton "Expand all" / "Collapse all"** | Déplie/replie tous les nodes. |
| **Clic droit** | Aucune action (pas de menu contextuel V1). |
| **Drag d'un node** | Interdit en V1 (lecture seule). Curseur `default`, pas `move`. |

### 5.2 Collapse / Expand

- État initial : **profondeur 1 visible** (racine + enfants directs). Les niveaux > 1 sont collapsed.
- Un toggle "+" / "−" est affiché sur chaque node ayant des enfants (`hasChildren: true`).
- L'expand d'un node dont les enfants ne sont pas encore chargés déclenche un lazy-fetch (loader visible sur le node pendant le chargement).
- L'état collapsed est géré dans un `Set<string>` côté état Zustand du composant.

### 5.3 Navigation hiérarchique

- Le breadcrumb existant (`useBoardData().breadcrumb`) reste affiché en haut de page.
- Un double-clic sur un node qui possède un childBoard appelle `onOpenChildBoard(boardId)`. La vue Mindmap se recharge alors sur le nouveau board courant (même comportement que le Kanban).
- Un bouton "Remonter" (parent) dans la toolbar permet de revenir au board parent (via breadcrumb).

### 5.4 Animations et interpolation entre layouts (Konva)

Les animations sont appliquées aux **propriétés Konva des shapes** (x, y, scaleX, scaleY, opacity) plutôt qu'en re-dessinant manuellement un canvas frame par frame. Konva re-rend automatiquement les Layers affectés.

#### 5.4.1 Tableau récapitulatif des transitions

| Transition | Mécanisme | Durée | Easing |
|---|---|---|---|
| Layout transition (expand/collapse) | rAF ticker → mise à jour des positions via refs Konva (voir 5.4.2) | 350ms | `ease-in-out` |
| Node entrant (apparition) | `scaleX`/`scaleY` 0→1, `opacity` 0→1 (depuis le parent) | 250ms | `ease-out` |
| Node sortant (disparition) | `scaleX`/`scaleY` 1→0, `opacity` 1→0 (vers le parent) | 200ms | `ease-in` |
| Hover scale-up | `shape.to({ scaleX: 1.15, scaleY: 1.15, duration: 0.15 })` — Konva.Tween natif | 150ms | ease-out (built-in) |
| Sélection node | Ring glow (stroke + shadowBlur) — prop change immédiat | Immédiat | — |
| Pan | Stage.draggable natif — Konva interpole nativement | Natif | — |
| Zoom | Impératif Konva (stage.scaleX/Y/x/y) + sync React debounced via rAF | Immédiat | — |
| Recentrer (fit) | Tween sur stagePos + stageScale via rAF | 400ms | `ease-in-out` |

#### 5.4.2 Stratégie d'interpolation positions anciennes → nouvelles

La logique de diffing **reste identique** à l'approche Canvas natif : on calcule des snapshots `from` et `to`, on identifie les nodes persisting/entering/exiting, et on interpole. La différence : au lieu de re-dessiner un canvas entier, on met à jour les propriétés des shapes Konva via leurs refs.

**Architecture :**

```typescript
// mindmap-animation.ts

interface NodeSnapshot {
  x: number;
  y: number;
  scaleX: number;  // 1.0 visible, 0.0 non présent
  scaleY: number;
  opacity: number;
}

interface LayoutTransition {
  startTime: number;
  duration: number;
  from: Map<string, NodeSnapshot>;
  to: Map<string, NodeSnapshot>;
}
```

**Approche hybride : rAF ticker + refs Konva**

Au lieu d'utiliser `Konva.Tween` pour chaque node individuellement (ce qui créerait N tweens simultanés et surchargerait le scheduler Konva), on utilise un **unique ticker rAF** qui, à chaque frame, met à jour directement les propriétés des shapes Konva via leurs refs.

```typescript
// Dans BoardMindmapView.tsx

// Map nodeId → ref Konva.Group pour accès direct aux shapes
const nodeRefsMap = useRef<Map<string, Konva.Group>>(new Map());
const transitionRef = useRef<LayoutTransition | null>(null);
const prevLayoutRef = useRef<MindmapNode[]>([]);

// Callback passé à chaque <MindmapNodeShape> pour enregistrer sa ref
const registerNodeRef = useCallback((nodeId: string, ref: Konva.Group | null) => {
  if (ref) {
    nodeRefsMap.current.set(nodeId, ref);
  } else {
    nodeRefsMap.current.delete(nodeId);
  }
}, []);
```

**Algorithme de transition (identique au PRD précédent, appliqué sur Konva) :**

```
FUNCTION startLayoutTransition(oldNodes, newNodes):

  // 1. Construire les maps de positions
  oldMap = Map(oldNodes.map(n → [n.id, { x: n.x, y: n.y, scaleX: 1, scaleY: 1, opacity: 1 }]))
  newMap = Map(newNodes.map(n → [n.id, { x: n.x, y: n.y, scaleX: 1, scaleY: 1, opacity: 1 }]))

  // 2. Identifier les catégories de nodes
  allIds = UNION(oldMap.keys(), newMap.keys())
  fromSnapshots = new Map()
  toSnapshots = new Map()

  FOR EACH id IN allIds:
    IF oldMap.has(id) AND newMap.has(id):
      // PERSISTING — interpolation directe
      fromSnapshots.set(id, oldMap.get(id))
      toSnapshots.set(id, newMap.get(id))

    ELSE IF NOT oldMap.has(id) AND newMap.has(id):
      // ENTERING — apparaît depuis la position du parent
      parentId = newNodes.find(n → n.id === id).parentId
      parentPos = newMap.get(parentId) ?? { x: 0, y: 0 }
      fromSnapshots.set(id, { x: parentPos.x, y: parentPos.y, scaleX: 0, scaleY: 0, opacity: 0 })
      toSnapshots.set(id, { ...newMap.get(id), scaleX: 1, scaleY: 1, opacity: 1 })

    ELSE IF oldMap.has(id) AND NOT newMap.has(id):
      // EXITING — disparaît vers le parent
      parentId = oldNodes.find(n → n.id === id).parentId
      parentPos = newMap.get(parentId) ?? oldMap.get(parentId) ?? { x: 0, y: 0 }
      fromSnapshots.set(id, oldMap.get(id))
      toSnapshots.set(id, { x: parentPos.x, y: parentPos.y, scaleX: 0, scaleY: 0, opacity: 0 })

  // 3. Lancer le ticker
  transitionRef.current = {
    startTime: performance.now(),
    duration: 350,
    from: fromSnapshots,
    to: toSnapshots,
  }
  requestAnimationFrame(tickTransition)


FUNCTION tickTransition(now):
  transition = transitionRef.current
  IF transition === null: RETURN

  elapsed = now - transition.startTime
  rawT = CLAMP(elapsed / transition.duration, 0, 1)
  t = easeInOut(rawT)

  // Mettre à jour chaque shape Konva via sa ref
  FOR EACH [id, fromSnap] IN transition.from:
    toSnap = transition.to.get(id)
    group = nodeRefsMap.current.get(id)
    IF group === null: CONTINUE

    group.x(LERP(fromSnap.x, toSnap.x, t))
    group.y(LERP(fromSnap.y, toSnap.y, t))
    group.scaleX(LERP(fromSnap.scaleX, toSnap.scaleX, t))
    group.scaleY(LERP(fromSnap.scaleY, toSnap.scaleY, t))
    group.opacity(LERP(fromSnap.opacity, toSnap.opacity, t))

  // Forcer le redraw du Layer (une seule fois par frame)
  nodesLayerRef.current?.batchDraw()
  edgesLayerRef.current?.batchDraw()

  IF rawT < 1:
    requestAnimationFrame(tickTransition)
  ELSE:
    // Animation terminée — nettoyer les exiting nodes
    transitionRef.current = null
    prevLayoutRef.current = newNodes
    // Les positions finales sont déjà appliquées via le dernier tick
```

**Pourquoi un ticker rAF plutôt que N × Konva.Tween :**

| Approche | Avantage | Inconvénient |
|---|---|---|
| 1 `Konva.Tween` par node | API simple, `node.to(...)` | 200+ tweens simultanés = overhead scheduler Konva + garbage collection |
| **1 ticker rAF (choisi)** | **Un seul rAF, un seul batchDraw par frame** | Code custom (~60 lignes), mais identique à l'approche Canvas natif |
| React state updates par frame | Déclaratif pur (setState) | 60 re-renders/seconde → beaucoup trop de reconciliation React |

**Note :** `Konva.Tween` est utilisé pour les micro-animations (hover scale-up, selection glow) où un seul shape est affecté. Le ticker rAF est réservé aux transitions de layout impliquant N nodes.

#### 5.4.3 Gestion des nodes entrants (Entering)

- **Position de départ** : centre du node parent dans le nouveau layout. Le `<Group>` est monté avec `x=parent.x, y=parent.y, scaleX=0, scaleY=0, opacity=0`.
- **Animation** : le ticker interpole vers `x=target.x, y=target.y, scaleX=1, scaleY=1, opacity=1`.
- **Timing** : démarre à t=0.15 (entering nodes apparaissent avec un léger retard).

```
ENTERING TIMING:
  adjustedT = CLAMP((t - 0.15) / 0.85, 0, 1)
  scaleX = scaleY = LERP(0, 1, adjustedT)
  opacity = LERP(0, 1, adjustedT)
```

#### 5.4.4 Gestion des nodes sortants (Exiting)

- Les nodes sortants sont **gardés dans le React tree** pendant la durée de la transition (350ms), puis retirés.
- Le ticker interpole `scaleX/scaleY` 1→0 et `opacity` 1→0, position vers le parent.
- **Timing** : s'achève à t=0.85 pour que les nodes sortants disparaissent avant la fin.

```
EXITING TIMING:
  adjustedT = CLAMP(t / 0.85, 0, 1)
  scaleX = scaleY = LERP(1, 0, adjustedT)
  opacity = LERP(1, 0, adjustedT)
```

**Implémentation des exiting nodes dans React :**

```typescript
// Maintenir une liste de "ghost nodes" pendant l'animation
const [exitingNodes, setExitingNodes] = useState<MindmapNode[]>([]);

// Quand le layout change :
useEffect(() => {
  const oldIds = new Set(prevLayoutRef.current.map(n => n.id));
  const newIds = new Set(layoutResult.nodes.map(n => n.id));
  const exiting = prevLayoutRef.current.filter(n => !newIds.has(n.id));

  if (exiting.length > 0) {
    setExitingNodes(exiting);
    // Retirer les ghosts après la transition
    setTimeout(() => setExitingNodes([]), 350);
  }

  startLayoutTransition(prevLayoutRef.current, layoutResult.nodes);
  prevLayoutRef.current = layoutResult.nodes;
}, [layoutResult]);

// Dans le JSX, rendre nodes actuels + exiting nodes :
// <MindmapNodesLayer nodes={[...visibleNodes, ...exitingNodes]} ... />
```

#### 5.4.5 Cas spéciaux

| Cas | Comportement |
|---|---|
| **Animation interrompue** | Les positions interpolées au moment de l'interruption deviennent le nouveau `from`. Pas de queue. |
| **Expand rapide de plusieurs nodes** | Le layout final inclut tous les expands. La transition en cours est interrompue, nouvelle transition depuis les positions interpolées. |
| **Racine change (navigation board)** | Pas d'animation de layout — reset complet. Fade-in CSS du conteneur (opacity 0→1, 200ms). |
| **Lazy-load pendant animation** | Layout recalculé, animation interrompue, nouvelle transition démarrée. |

#### 5.4.6 Edges pendant la transition

Les edges sont re-dessinés à chaque frame par le `batchDraw()` du Layer edges. Pour suivre les positions interpolées des nodes, les edges recalculent leur path à chaque tick en lisant les positions **réelles des Groups Konva** via `group.x()` / `group.y()`.

**Approche retenue (simplifiée) :** aucune Map `currentInterpolated` séparée. Le ticker met à jour les positions des `<Group>` nodes. Les edges lisent ces positions directement.

```typescript
// Pendant le tick, pour chaque edge :
const edgeRefsMap = useRef<Map<string, Konva.Path>>(new Map());

// Dans tickTransition, après mise à jour des positions nodes :
FOR EACH edge IN layoutResult.edges:
  sourceGroup = nodeRefsMap.current.get(edge.sourceId)
  targetGroup = nodeRefsMap.current.get(edge.targetId)
  pathRef = edgeRefsMap.current.get(`${edge.sourceId}-${edge.targetId}`)
  IF pathRef AND sourceGroup AND targetGroup:
    pathRef.data(computeBezierPath(
      { x: sourceGroup.x(), y: sourceGroup.y() },
      { x: targetGroup.x(), y: targetGroup.y() },
    ))
```

Cette approche élimine la duplication d'état : la source de vérité pour les positions pendant l'animation est toujours le Group Konva lui-même.

### 5.5 États visuels des nodes

```
┌──────────────────────────────────────────────┐
│  État         │ Visuel                        │
├──────────────┼───────────────────────────────┤
│  Default     │ Cercle plein, couleur selon   │
│              │ behaviorKey de la colonne :    │
│              │   BACKLOG    → amber-400       │
│              │   IN_PROGRESS → sky-400        │
│              │   BLOCKED    → rose-400        │
│              │   DONE       → emerald-400     │
│              │   CUSTOM     → slate-400       │
│              │   null (root) → accent (violet)│
├──────────────┼───────────────────────────────┤
│  Hover       │ Cercle grossi ×1.15,          │
│              │ ombre portée 0 0 8px color/40  │
├──────────────┼───────────────────────────────┤
│  Selected    │ Ring blanc 2px + glow          │
├──────────────┼───────────────────────────────┤
│  Has children│ Badge "+" ou "−" en bas-droite │
│              │ (cercle blanc avec symbole,  │
│              │  hit-zone 14px)              │
├──────────────┼───────────────────────────────┤
│  Loading     │ Cercle pulsant (opacity cycle) │
│  children    │                                │
├──────────────┼───────────────────────────────┤
│  Progress    │ Arc de cercle autour du node   │
│              │ (0% → 100%, trait de 3px)      │
└──────────────┴───────────────────────────────┘
```

### 5.6 Edges

- **Courbes de Bézier quadratiques** du centre du parent au centre de l'enfant, avec un point de contrôle à mi-distance radiale.
- Couleur : `rgba(255, 255, 255, 0.12)`.
- Épaisseur : 1.5px.
- Pas de flèche (la direction est implicite : centre → périphérie).

### 5.7 Labels

- Position : à droite du node si `node.angle ∈ [-π/2, π/2]`, sinon à gauche.
- Police : identique au thème (`font-family: var(--font-sans)`).
- Taille : 12px, truncation à `LABEL_MAX_WIDTH` avec ellipsis.
- Couleur : `foreground` (blanc cassé thème sombre Stratum).
- N'afficher les labels que si `zoom >= 0.5` pour éviter le bruit visuel à faible zoom.

### 5.8 Tooltip (au hover)

Affiché via un `<div>` positionné en absolu au-dessus du canvas (pas rendu dans le canvas). Contenu :

```
┌─────────────────────────────────┐
│ ⬤ Titre du node                │
│ Priorité: HIGH  │  Effort: M   │
│ Progress: ████░░░░░░ 45%       │
│ Assigné à: Alice, Bob          │
│ Échéance: 15 mars 2026         │
└─────────────────────────────────┘
```

Délai d'apparition : 400ms (debounce), disparition immédiate au mouse-leave.

---

## 6. Performance

### 6.1 Objectif

- **60 fps** pour pan et zoom avec ≤ 500 nodes visibles.
- **30 fps** acceptable entre 500 et 1 000 nodes visibles.
- Au-delà de 1 000 nodes visibles, afficher un avertissement et proposer un collapse automatique.

### 6.2 Stratégie de rendu Konva (Canvas 2D structuré)

1. **Pas de DOM par node** — Konva dessine tout sur un `<canvas>` interne par Layer. Seuls le tooltip et la toolbar sont des éléments DOM React classiques.

2. **Layers multiples pour redraw sélectif** — Konva re-dessine chaque `<Layer>` indépendamment. Quand un node change d'état (hover, selection), seul le Layer "nodes" est re-rendu. Le Layer "edges" (statique entre deux transitions) n'est pas re-dessiné. C'est un gain significatif par rapport à un canvas unique re-dessiné entièrement à chaque frame.

   | Layer | Interactif | Fréquence de redraw |
   |---|---|---|
   | Edges | Non (`listening={false}`) | Uniquement lors des transitions de layout |
   | Nodes | Oui (click, hover, dblclick) | Au hover, selection, animation |
   | Labels | Non (`listening={false}`) | Uniquement quand les positions changent ou le zoom passe le seuil 0.5 |

3. **Viewport culling au niveau React** — Les nodes hors du viewport ne sont **pas montés** dans le React tree. Cela signifie zéro shape Konva créée, zéro event listener, zéro draw call pour ces nodes. Le filtrage est un `useMemo` dans `BoardMindmapView.tsx` (cf. section 2.2) :

   ```typescript
   function isNodeInViewport(
     node: MindmapNode,
     stagePos: { x: number; y: number },
     stageScale: number,
     containerWidth: number,
     containerHeight: number,
   ): boolean {
     const screenX = node.x * stageScale + stagePos.x;
     const screenY = node.y * stageScale + stagePos.y;
     const CULL_MARGIN = 150; // px écran — constante, indépendante du zoom
     return (
       screenX >= -CULL_MARGIN && screenX <= containerWidth + CULL_MARGIN &&
       screenY >= -CULL_MARGIN && screenY <= containerHeight + CULL_MARGIN
     );
   }
   ```

4. **Level-of-Detail (LoD) via montage conditionnel** —
   - `stageScale >= 0.5` : node complet (cercle + progress arc + badge enfants) **+ labels** (Layer labels monté).
   - `stageScale >= 0.2 && stageScale < 0.5` : cercle + pastille couleur. Layer labels **démonté** (`{stageScale >= 0.5 && <Layer>...}`).
   - `stageScale < 0.2` : cercles réduits (radius diminué). Pas de progress arc ni badge.

   Le LoD est implémenté par **montage/démontage conditionnel React** des sous-composants, pas par logique de draw custom.

5. **Hit-testing natif Konva** — Konva gère nativement le hit-testing per-shape via les event handlers (`onClick`, `onMouseEnter`, `onDblClick`). Aucun code custom de hit-test n'est nécessaire. Pour le Layer edges (`listening={false}`), Konva skip complètement le hit-testing — gain de performance.

6. **HiDPI automatique** — Konva gère nativement `window.devicePixelRatio`. Le canvas est automatiquement dimensionné à 2× sur écrans Retina. Aucun code custom (`canvas.width * dpr` + `ctx.scale(dpr, dpr)`) n'est nécessaire.

### 6.3 Memoization React

```typescript
// Dans BoardMindmapView.tsx

// Le layout est recalculé uniquement quand l'arbre change
const layoutResult = useMemo(
  () => computeRadialLayout(mindmapNodes),
  [mindmapNodes],   // mindmapNodes est le résultat de transformBoardToMindmapTree
);

// La liste des nodes mindmap est recalculée uniquement quand board/childBoards/collapsedIds changent
const mindmapNodes = useMemo(
  () => transformBoardToMindmapTree(board, childBoards, loadedSubtrees, collapsedIds),
  [board, childBoards, loadedSubtrees, collapsedIds],
);
```

### 6.4 Benchmarks Konva attendus

| Scénario | Nodes visibles | FPS cible | Stratégie |
|---|---|---|---|
| Desktop moderne, 1 Layer | 500 | 60 | Layer unique, culling React |
| Desktop moderne, 3 Layers | 500 | 60 | Layers edges/nodes/labels, culling React |
| Transition layout (rAF ticker) | 300 nodes animés | 60 | 1 rAF + batchDraw, pas N×Konva.Tween |
| Zoom continu (wheel) | 500 | 60 | Updates impératives Konva (stage.scaleX/Y/x/y) + sync React state debounced via rAF |
| Hover rapide | 500 | 60 | Konva.Tween sur shape individuelle, pas de re-render React |

**Note :** Konva est benchmarké à ~5000 shapes simples (rectangles/cercles) à 60 fps sur desktop. Notre cas maximal (500 nodes × ~3 shapes/node + 500 edges = ~2000 shapes) est bien dans l'enveloppe.

### 6.5 Limite de nodes et dégradation gracieuse

| Seuil | Comportement |
|---|---|
| 0–300 nodes | Rendu complet, labels visibles |
| 300–500 nodes | Labels masqués automatiquement (LoD) |
| 500–1000 nodes | Avertissement "Vue simplifiée". Seuls 2 niveaux de profondeur sont visibles, le reste est collapsed. |
| > 1000 nodes | Message "Arbre trop volumineux, collapsez certaines branches". Auto-collapse aux 2 premiers niveaux. |

---

## 7. Accessibilité

### 7.1 Navigation clavier

| Touche | Action |
|---|---|
| `Tab` | Focus sur la zone canvas (le canvas est `tabindex="0"`) |
| `Arrow keys` | Navigue entre nodes (haut/bas = frères, gauche = parent, droite = premier enfant) |
| `Enter` | Ouvre le TaskDrawer pour le node focalisé (même règle que le clic) |
| `Space` | Toggle collapse/expand du node focalisé |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit to content (recentrer) |
| `Escape` | Désélectionner le node courant |
| `Home` | Focus sur la racine |

### 7.2 Focus management

- Le node focalisé par clavier reçoit le même état visuel "Selected" (ring blanc + glow).
- Un `aria-live="polite"` annonce le titre du node focalisé et sa profondeur.
- Le composant gère un `focusedNodeId` dans son state.

### 7.3 ARIA

Konva génère un `<div>` wrapper contenant le `<canvas>`. Le `tabindex` est placé sur ce wrapper div (accessible via `stageRef.current.container()`).

```html
<div role="tree" aria-label="Carte mentale du projet">
  <!-- Le div wrapper Konva reçoit le focus clavier -->
  <div tabindex="0" role="img" aria-label="Visualisation de la hiérarchie du projet sous forme de carte mentale">
    <canvas /><!-- Géré par Konva, non accessible directement -->
  </div>
  <!-- Région live pour annoncer les navigations -->
  <div aria-live="polite" class="sr-only">
    <!-- Mis à jour dynamiquement -->
    Node sélectionné : Titre du node (niveau 2, 5 enfants)
  </div>
</div>
```

**Configuration du focus Konva :**

```typescript
// Dans BoardMindmapView.tsx — après le mount
useEffect(() => {
  const container = stageRef.current?.container();
  if (container) {
    container.tabIndex = 0;
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', 'Visualisation de la hiérarchie du projet sous forme de carte mentale');
  }
}, []);
```

### 7.4 Contraste

- Les couleurs de nodes (amber, sky, rose, emerald) ont un ratio de contraste ≥ 3:1 sur le fond sombre Stratum (`#0f1117` environ).
- Les labels blancs sur fond sombre respectent WCAG AA (≥ 4.5:1).

---

## 8. API backend

### 8.1 Endpoints existants suffisants (V1)

Aucun nouvel endpoint n'est nécessaire en V1. La vue Mindmap utilise :

| Endpoint | Usage |
|---|---|
| `GET /boards/:boardId/detail` | Charge le board courant avec colonnes + nodes (depth 1) |
| `GET /nodes/:nodeId/child-boards` | Liste les sous-boards d'un node (pour savoir qui a des enfants) |
| `GET /nodes/:nodeId/breadcrumb` | Breadcrumb pour navigation |

Pour le lazy-loading de profondeur > 1 :
| Endpoint | Usage |
|---|---|
| `POST /nodes/:nodeId/ensure-child-board` | Crée le board s'il n'existe pas, retourne `{ boardId }` |
| `GET /boards/:boardId/detail` | Charge le sous-board pour obtenir ses nodes |

### 8.2 Endpoint futur recommandé (V2)

Pour optimiser le chargement d'un sous-arbre complet en un seul appel :

```
GET /nodes/:nodeId/subtree?maxDepth=3&fields=id,parentId,title,priority,progress,effort,behaviorKey,hasChildren
```

Ce endpoint n'est **pas nécessaire en V1**. Le lazy-loading board par board suffit pour < 500 nodes.

### 8.3 Stratégie de chargement V1 (robuste)

#### 8.3.1 Flux nominal

```
1. Le board courant est déjà chargé (useBoardData)            → depth 0-1 immédiat
2. childBoards est aussi chargé                                → on sait quels nodes ont des enfants
3. Quand l'utilisateur expand un node avec childBoard :
   a. ensureChildBoard(nodeId)                                 → obtient boardId
   b. fetchBoardDetail(boardId)                                → obtient les nodes du sous-board
   c. fetchChildBoards(nodeId du sous-board)                   → obtient les childBoards de ce niveau
   d. Les résultats sont stockés dans loadedSubtrees (Map)
   e. Le layout est recalculé
```

#### 8.3.2 AbortController — annulation des requêtes obsolètes

Chaque opération d'expand déclenche une chaîne de 2-3 requêtes réseau. Si l'utilisateur collapse le node avant la fin, ou navigue ailleurs, ces requêtes doivent être annulées.

```typescript
// Dans BoardMindmapView.tsx

/** Map nodeId → AbortController pour chaque chargement en cours */
const expandControllersRef = useRef<Map<string, AbortController>>(new Map());

async function expandNode(nodeId: string): Promise<void> {
  // 1. Si un chargement est déjà en cours pour ce node, l'annuler
  const existingController = expandControllersRef.current.get(nodeId);
  if (existingController) {
    existingController.abort();
  }

  // 2. Créer un nouveau controller
  const controller = new AbortController();
  expandControllersRef.current.set(nodeId, controller);
  const signal = controller.signal;

  try {
    setLoadingNodeIds(prev => new Set(prev).add(nodeId));

    // 3. Chaîne de requêtes avec signal de cancellation
    const { boardId } = await ensureChildBoard(nodeId, { signal });
    if (signal.aborted) return;

    const boardDetail = await fetchBoardDetail(boardId, { signal });
    if (signal.aborted) return;

    const childBoardsData = await fetchChildBoards(nodeId, { signal });
    if (signal.aborted) return;

    // 4. Transformer en MindmapNode[] et stocker (cf. section 3.5 — contract loadedSubtrees)
    const subtreeNodes = transformSubBoardToNodes(nodeId, boardDetail, childBoardsData);
    setLoadedSubtrees(prev => new Map(prev).set(nodeId, subtreeNodes));

    // 5. Retirer des collapsed (déplier)
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Annulation volontaire — rien à faire
      return;
    }
    // Erreur réseau réelle — afficher feedback
    console.error(`Failed to expand node ${nodeId}:`, err);
    // TODO: toast d'erreur UX
  } finally {
    expandControllersRef.current.delete(nodeId);
    setLoadingNodeIds(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }
}

function collapseNode(nodeId: string): void {
  // Annuler tout chargement en cours pour ce node
  const controller = expandControllersRef.current.get(nodeId);
  if (controller) {
    controller.abort();
    expandControllersRef.current.delete(nodeId);
  }

  setCollapsedIds(prev => new Set(prev).add(nodeId));
}
```

#### 8.3.3 Protection contre les expansions rapides concurrentes

Scénario : l'utilisateur expand A, puis expand B, puis expand C en 500ms. Les 3 chaînes de requêtes tournent en parallèle.

**Décision :** les expansions concurrentes de nodes **différents** sont autorisées (elles ne s'interfèrent pas). Chaque expand a son propre `AbortController` indexé par `nodeId`.

**Protection :**

```
RÈGLES DE CONCURRENCE :

1. Même node expand + collapse rapide :
   → Le collapse annule l'AbortController du expand en cours
   → Résultat : le node reste collapsé, pas de données orphelines

2. Même node double-expand :
   → Le 2ème expand annule le 1er (AbortController.abort())
   → Seul le 2ème chargement aboutit

3. Nodes différents en parallèle :
   → Autorisé. Chaque expand/collapse est indépendant.
   → Limite soft : MAX_CONCURRENT_EXPANDS = 3
   → Au-delà, les expansions sont mises en queue (FIFO)

4. Changement de board (navigation) :
   → Tous les AbortControllers en cours sont annulés (cleanup useEffect)
   → loadedSubtrees est vidé
```

```typescript
// Cleanup global sur unmount ou changement de board
useEffect(() => {
  return () => {
    // Annuler toutes les requêtes en vol
    for (const controller of expandControllersRef.current.values()) {
      controller.abort();
    }
    expandControllersRef.current.clear();
  };
}, [board.id]);
```

#### 8.3.4 Queue d'expansion avec concurrence limitée

```typescript
const MAX_CONCURRENT_EXPANDS = 3;
const expandQueueRef = useRef<string[]>([]);

async function requestExpand(nodeId: string): Promise<void> {
  const activeCount = expandControllersRef.current.size;

  if (activeCount >= MAX_CONCURRENT_EXPANDS) {
    // En queue — sera traité quand un slot se libère
    expandQueueRef.current.push(nodeId);
    return;
  }

  await expandNode(nodeId);
  processQueue(); // Traiter le prochain en queue si disponible
}

function processQueue(): void {
  while (
    expandQueueRef.current.length > 0 &&
    expandControllersRef.current.size < MAX_CONCURRENT_EXPANDS
  ) {
    const nextNodeId = expandQueueRef.current.shift()!;
    // Vérifier que le node est toujours collapsed (l'utilisateur n'a pas annulé entre-temps)
    if (collapsedIds.has(nextNodeId)) {
      expandNode(nextNodeId).then(processQueue);
      break; // Un seul à la fois dans ce tick
    }
  }
}
```

#### 8.3.5 Préchargement intelligent (speculative prefetch)

Pour réduire la latence perçue lors de l'expand, un **préchargement opportuniste** est déclenché au hover prolongé sur un node collapsed ayant des enfants.

```
RÈGLES DE PREFETCH :

1. Trigger : mouseenter sur un node collapsed avec hasChildren=true
2. Délai : 800ms de hover continu (pas de déclenchement si l'utilisateur passe juste au-dessus)
3. Scope : uniquement ensureChildBoard + fetchBoardDetail (pas les childBoards, qui sont légers)
4. Stockage : les données prefetchées sont mises dans un cache temporaire (Map<nodeId, BoardDetail>)
5. Utilisation : quand expandNode est appelé, il vérifie d'abord le cache prefetch
6. TTL du cache prefetch : 30 secondes (invalidé si plus ancien)
7. Limite : max 2 prefetch simultanés (low priority), annulés si l'utilisateur scroll/pan
8. Abort : le prefetch est annulé au mouseleave (AbortController dédié)
```

```typescript
const prefetchCacheRef = useRef<Map<string, { data: BoardDetail; timestamp: number }>>(new Map());
const prefetchTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
const PREFETCH_DELAY = 800;
const PREFETCH_TTL = 30_000;

function onNodeHoverStart(nodeId: string): void {
  const node = mindmapNodes.find(n => n.id === nodeId);
  if (!node?.hasChildren || !node.collapsed || node.childrenLoaded) return;

  // Déjà en cache et frais ?
  const cached = prefetchCacheRef.current.get(nodeId);
  if (cached && Date.now() - cached.timestamp < PREFETCH_TTL) return;

  const timer = setTimeout(() => {
    prefetchSubtree(nodeId);
  }, PREFETCH_DELAY);
  prefetchTimerRef.current.set(nodeId, timer);
}

function onNodeHoverEnd(nodeId: string): void {
  const timer = prefetchTimerRef.current.get(nodeId);
  if (timer) {
    clearTimeout(timer);
    prefetchTimerRef.current.delete(nodeId);
  }
}
```

### 8.4 Cache et invalidation

- Les données chargées en lazy sont mises dans un `Map<nodeId, MindmapNode[]>` local au composant. **Les `MindmapNode[]` dans la Map sont stockés en depth relatif** : `depth=1` = enfants directs du node expansé, `depth=2` = petits-enfants, etc. Les `parentId` internes sont cohérents (enfants directs ont `parentId = nodeId`). Lors de l'injection dans `transformBoardToMindmapTree`, un `depthOffset` est appliqué (cf. section 3.3).
- Un refresh du board parent (via `refreshActiveBoard()`) invalide tout le cache mindmap.
- Pas de cache React Query séparé pour la mindmap — elle réutilise les queries existantes.

---

## 9. État global UI

### 9.1 Zustand store local au composant (pas global)

Contrairement au Kanban qui stocke ses filtres dans localStorage, la Mindmap a un état léger qui ne nécessite pas de store Zustand global.

L'état est géré en `useState` / `useRef` dans `BoardMindmapView.tsx` :

```typescript
// État du composant BoardMindmapView
// Viewport via Konva Stage (cf. section 2.2)
const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
const [stageScale, setStageScale] = useState(1);
const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
const [loadedSubtrees, setLoadedSubtrees] = useState<Map<string, MindmapNode[]>>(new Map());
const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());
```

### 9.2 Persistance

| Donnée | Persisté ? | Où |
|---|---|---|
| `stagePos` + `stageScale` (zoom + pan) | Oui | `localStorage` clé `stratum:board:${boardId}:mindmap-viewport:v1` |
| `collapsedIds` | Oui | `localStorage` clé `stratum:board:${boardId}:mindmap-collapsed:v1` |
| `selectedNodeId` | Non | Volatile (reset à chaque mount) |
| `loadedSubtrees` | Non | Volatile (rechargé depuis API) |

#### Sérialisation explicite Set / Map

`Set<string>` et `Map` ne sont pas serialisables en JSON nativement. La persistance utilise une conversion explicite :

```typescript
const STORAGE_VERSION = 'v1';

function saveMindmapCollapsed(boardId: string, collapsedIds: Set<string>): void {
  const key = `stratum:board:${boardId}:mindmap-collapsed:${STORAGE_VERSION}`;
  localStorage.setItem(key, JSON.stringify([...collapsedIds]));
}

function loadMindmapCollapsed(boardId: string): Set<string> {
  const key = `stratum:board:${boardId}:mindmap-collapsed:${STORAGE_VERSION}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function saveMindmapViewport(
  boardId: string,
  stagePos: { x: number; y: number },
  stageScale: number,
): void {
  const key = `stratum:board:${boardId}:mindmap-viewport:${STORAGE_VERSION}`;
  localStorage.setItem(key, JSON.stringify({ x: stagePos.x, y: stagePos.y, scale: stageScale }));
}

function loadMindmapViewport(
  boardId: string,
): { x: number; y: number; scale: number } | null {
  const key = `stratum:board:${boardId}:mindmap-viewport:${STORAGE_VERSION}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number' || typeof obj.scale !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}
```

**Versionning des clés :** le suffixe `:v1` permet d'invalider le cache local si le format change (passer à `:v2` suffira).

### 9.3 Interaction avec `board-ui-settings`

Le seul changement au store existant est l'ajout de `"mindmap"` au type `BoardViewMode`. La persistance localStorage du `boardView` gère déjà la valeur `"mindmap"` automatiquement.

---

## 10. Plan d'implémentation

### Phase 1 — Layout + Rendu statique Konva (Fondation)

1. Installer `konva` + `react-konva` (`npm install konva react-konva`).
2. Créer `mindmap-types.ts` avec les types.
3. Créer `mindmap-transform.ts` avec la transformation `Board → MindmapNode[]`.
4. Créer `mindmap-layout.ts` avec `computeRadialLayout()` incluant l'ancrage angulaire (4.4).
5. Créer `MindmapEdgesLayer.tsx` — composant `<Layer>` Konva pour les courbes de Bézier.
6. Créer `MindmapNodeShape.tsx` — composant Konva pour un node individuel (Group → Circle + Arc + Badge).
7. Créer `MindmapNodesLayer.tsx` — composant `<Layer>` Konva mappant les nodes visibles vers `<MindmapNodeShape>`.
8. Créer `MindmapLabelsLayer.tsx` — composant `<Layer>` Konva pour les labels texte.
9. Créer `BoardMindmapView.tsx` — composant principal avec `<Stage>`, state, viewport culling, 3 Layers.
10. Modifier `BoardViewMode` et `BoardPageShell.tsx` pour ajouter le bouton + routage.
11. Implémenter la détection de collision post-layout + cascade de résolution (4.6).
12. Implémenter `computeLabelPlacements()` avec troncature adaptive et anti-chevauchement vertical (4.6.2).

### Phase 2 — Interactions + Collapse/Expand

13. Ajouter pan (Stage.draggable natif) + zoom (onWheel centré sur pointeur).
14. Ajouter sélection de node (onClick Konva natif) + hover (onMouseEnter/Leave + Konva.Tween micro-animation).
15. Ajouter tooltip hover (div DOM overlay, positionné via stagePos + stageScale).
16. Ajouter collapse/expand avec animation interpolation layout via rAF ticker + refs Konva (5.4.2).
17. Implémenter le système de transition enter/exit/persist nodes avec ghost nodes React (5.4.3, 5.4.4).
18. Ajouter lazy-loading robuste avec AbortController + queue de concurrence (8.3.2–8.3.4).
19. Ajouter le préchargement spéculatif au hover (8.3.5).

### Phase 3 — Polish

20. Ajouter navigation clavier (keyDown sur Stage container div).
21. Ajouter ARIA + annonces live (7.3).
22. Ajouter persistance localStorage (stagePos + stageScale + collapsedIds).
23. Ajouter Level-of-Detail : montage conditionnel du Labels Layer, simplification shapes à faible zoom.
24. Ajouter toolbar (zoom ±, recentrer, expand all, collapse all).
25. Ajouter i18n (clés `mindmap.*` dans les fichiers de traduction).

### Phase 4 — Tests

26. Tests unitaires pour `mindmap-layout.ts` (déterminisme, stabilité angulaire, collision detection).
27. Tests unitaires pour `mindmap-transform.ts`.
28. Tests unitaires pour `computeLabelPlacements()` (cas de chevauchement).
29. Tests unitaires pour l'animation interpolation (enter/exit/persist snapshots).
30. Test d'intégration du composant `BoardMindmapView` (render + interactions basiques via react-konva mocks).

### Phase 5 — Export (V2)

31. Implémenter `exportToPng()` via `stage.toDataURL({ pixelRatio: 2 })` avec recadrage automatique sur bounds.
32. Implémenter `exportToSvg()` via génération de string SVG (indépendant de Konva).
33. Implémenter `handlePrint()` via iframe SVG.
34. Ajouter les boutons export dans la toolbar.

---

## 11. Risques techniques

### 11.1 Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Perf Konva > 500 nodes (3 Layers) | Moyenne | Élevé | Viewport culling React + LoD conditionnel + auto-collapse. Mesurer avec Performance API. Konva benchmarké à ~5000 shapes simples à 60fps. |
| Labels illisibles à zoom faible | Élevée | Moyen | LoD : Labels Layer démonté quand `stageScale < 0.5` |
| Lazy-loading lent (cascade d'appels API) | Moyenne | Moyen | Loader visuel sur le node en expansion. AbortController. V2 : endpoint `/subtree`. |
| Layout instable lors d'expand/collapse | Faible | Élevé | Ancrage angulaire (ANCHOR_BLEND=0.4) + animation interpolation 350ms via rAF ticker. |
| Conflit de clavier avec le navigateur | Faible | Faible | N'écouter les touches que quand le Stage container a le focus. `preventDefault` uniquement sur les touches gérées. |
| Dépendance Konva (breaking changes) | Faible | Moyen | Konva est stable (~4 majeurs/an, `react-konva` suit React). Le layout est découplé : migrer le renderer = remplacer les composants Konva, pas le layout. |
| Collision persistante de nodes | Faible | Moyen | Cascade de résolution (4.6.4) : masquer labels → étendre rayon → tronquer → auto-collapse → message UX. |
| Requêtes orphelines sur expand/collapse rapide | Moyenne | Faible | AbortController par node + cleanup useEffect sur changement de board. |
| Export PNG dépassant 4096px | Faible | Faible | Scale down automatique via `stage.toDataURL()`. Avertissement si > 1000 nodes dans l'export. |

### 11.2 Limites connues (V1)

- **Pas de drag & drop** : repositionner un node dans l'arbre n'est pas supporté. C'est une limitation volontaire pour garder la vue en lecture seule.
- **Pas de filtre** : la mindmap affiche tous les nodes sans filtre par priorité, assignee, etc. Le filtrage est renvoyé à V2.
- **Pas de recherche highlight** : la barre de recherche du Kanban n'est pas connectée à la mindmap. Renvoyé à V2.
- **Mobile non supporté** : touch events (pinch zoom, tap) ne sont pas gérés en V1. Desktop only. Note : Konva supporte nativement les touch events, ce qui facilitera le support mobile en V2.
- **Profondeur limitée par le lazy-loading** : chaque niveau nécessite un appel API. Au-delà de 5 niveaux, l'UX se dégrade.

### 11.3 Dette technique maîtrisée (Konva)

Le choix de Konva **réduit significativement** la dette technique par rapport à une approche Canvas natif :

| Dimension | Canvas natif (rejeté) | Konva (choisi) |
|---|---|---|
| Hit-testing | ~40 LOC custom, maintenance à chaque nouveau shape | Natif (zéro code) |
| Pan/Zoom | ~80 LOC custom (dpr, coordinate mapping) | `Stage.draggable` + `onWheel` (~15 LOC) |
| HiDPI / devicePixelRatio | Code custom fragile (`canvas.width * dpr + ctx.scale`) | Géré automatiquement par Konva |
| Animation | rAF + canvas full-redraw (~100 LOC) | rAF + refs Konva + `batchDraw()` (~60 LOC) |
| Export PNG | `OffscreenCanvas` custom (~50 LOC) | `stage.toDataURL()` (~5 LOC) |
| **Total code utilitaire** | **~350 LOC** | **~80 LOC** |

**Risque résiduel** : dépendance à `konva` + `react-konva` (~70 KB gzipped). Mitigé par :
- Le layout est totalement découplé du renderer (module `mindmap-layout.ts` en TS pur).
- Le renderer est un module interchangeable (composants Konva → composants PixiJS en cas de besoin scale).
- L'export SVG est indépendant de Konva (string generator pur).

---

## 12. Export & Snapshot Strategy

### 12.1 Vision

L'export est une fonctionnalité **V2** mais l'architecture V1 est conçue pour la supporter sans refactoring. Cette section définit les décisions structurantes.

### 12.2 Formats d'export

| Format | Cas d'usage | Priorité |
|---|---|---|
| **PNG** | Partage rapide (Slack, email, docs) | V2.0 |
| **SVG** | Intégration dans des documents, impression haute qualité, édition vectorielle | V2.0 |
| **Impression (print)** | Ctrl+P ou bouton "Imprimer" — rendu papier de la mindmap | V2.1 |
| **PDF** | Génération serveur-side (hors scope client) | V3 |
| **JSON (données brutes)** | Export/import de la structure de l'arbre | Hors scope |

### 12.3 Gestion du viewport exporté

**Décision :** l'export capture **la totalité de l'arbre visible** (pas uniquement le viewport courant). Le viewport de l'utilisateur (zoom/pan) n'affecte pas le résultat exporté.

```
RÈGLES D'EXPORT VIEWPORT :

1. Bounds calculés : utiliser MindmapLayoutResult.bounds (min/max de tous les nodes visibles)
2. Padding : 60px sur chaque côté (top, right, bottom, left)
3. Résolution :
   - PNG : bounds + padding, scaled à 2× pour Retina (max 4096×4096 px, au-delà → scale down)
   - SVG : bounds + padding en unités SVG, viewBox calculé
4. Fond :
   - PNG : couleur de fond du thème Stratum (#0f1117) — pas transparent (sinon illisible dans Slack)
   - SVG : rect de fond optionnel (paramètre `includeBackground: boolean`)
5. Labels : toujours affichés (override LoD — pas de zoom-based masking dans l'export)
6. Nodes collapsed : exportés tels quels (pas d'auto-expand pour l'export)
```

### 12.4 Export PNG

L'export PNG utilise la méthode native de Konva `stage.toDataURL()` qui capture le contenu de tous les Layers en un seul appel. Pour exporter la totalité de l'arbre (pas uniquement le viewport), on manipule temporairement le Stage.

```typescript
async function exportToPng(
  stageRef: React.RefObject<Konva.Stage>,
  layoutResult: MindmapLayoutResult,
  options: { scale?: number; background?: string } = {},
): Promise<Blob> {
  const { scale = 2, background = '#0f1117' } = options;
  const { bounds } = layoutResult;
  const PADDING = 60;
  const stage = stageRef.current;
  if (!stage) throw new Error('Stage not mounted');

  const contentWidth = bounds.maxX - bounds.minX + PADDING * 2;
  const contentHeight = bounds.maxY - bounds.minY + PADDING * 2;

  // Plafond résolution
  const MAX_DIMENSION = 4096;
  const effectiveScale = Math.min(
    scale,
    MAX_DIMENSION / contentWidth,
    MAX_DIMENSION / contentHeight,
  );

  // Sauvegarder l'état actuel du Stage
  const prevPos = { x: stage.x(), y: stage.y() };
  const prevScale = { x: stage.scaleX(), y: stage.scaleY() };
  const prevSize = { width: stage.width(), height: stage.height() };

  // Reconfigurer le Stage pour capturer l'arbre entier
  stage.position({
    x: (-bounds.minX + PADDING) * effectiveScale,
    y: (-bounds.minY + PADDING) * effectiveScale,
  });
  stage.scale({ x: effectiveScale, y: effectiveScale });
  stage.size({
    width: contentWidth * effectiveScale,
    height: contentHeight * effectiveScale,
  });
  stage.batchDraw();

  // Export natif Konva
  const dataUrl = stage.toDataURL({
    pixelRatio: 1, // déjà scaled par effectiveScale
    mimeType: 'image/png',
  });

  // Restaurer l'état du Stage
  stage.position(prevPos);
  stage.scale(prevScale);
  stage.size(prevSize);
  stage.batchDraw();

  // Convertir dataURL en Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return blob;
}
```

**Note :** une approche alternative sans manipuler le Stage live consiste à cloner le stage Konva dans un conteneur off-screen via `stage.clone()`. Cette option est préférable si le flash visuel pendant l'export est perceptible (à valider en test).

**Téléchargement :**

```typescript
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Usage dans la toolbar :
async function handleExportPng(): Promise<void> {
  const blob = await exportToPng(stageRef, layoutResult);
  downloadBlob(blob, `mindmap-${board.name}-${Date.now()}.png`);
}
```

### 12.5 Export SVG

L'export SVG ne passe **pas** par le canvas. Il génère un document SVG en construisant directement le DOM string à partir des mêmes données que le renderer.

**Raison :** un SVG canvas-based (via `canvas.toDataURL`) produit un raster encapsulé, pas un vrai vecteur. Pour un export SVG exploitable (zoom infini, éditable dans Figma/Illustrator), il faut générer les éléments vectoriels.

```typescript
function exportToSvg(
  layoutResult: MindmapLayoutResult,
  options: { includeBackground?: boolean } = {},
): string {
  const { includeBackground = true } = options;
  const { bounds, nodes, edges } = layoutResult;
  const PADDING = 60;

  const width = bounds.maxX - bounds.minX + PADDING * 2;
  const height = bounds.maxY - bounds.minY + PADDING * 2;
  const viewBox = `${bounds.minX - PADDING} ${bounds.minY - PADDING} ${width} ${height}`;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">`);

  // Fond
  if (includeBackground) {
    parts.push(`<rect x="${bounds.minX - PADDING}" y="${bounds.minY - PADDING}" width="${width}" height="${height}" fill="#0f1117"/>`);
  }

  // Edges — courbes de Bézier
  parts.push('<g class="edges" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" fill="none">');
  for (const edge of edges) {
    const source = nodes.find(n => n.id === edge.sourceId)!;
    const target = nodes.find(n => n.id === edge.targetId)!;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    // Point de contrôle à mi-distance radiale du parent
    const ctrlX = source.x + (midX - source.x) * 0.5;
    const ctrlY = source.y + (midY - source.y) * 0.5;
    parts.push(`<path d="M${source.x},${source.y} Q${ctrlX},${ctrlY} ${target.x},${target.y}"/>`);
  }
  parts.push('</g>');

  // Nodes — cercles avec couleur selon behaviorKey
  parts.push('<g class="nodes">');
  for (const node of nodes) {
    const color = getNodeColor(node);
    const r = node.depth === 0
      ? LAYOUT_CONSTANTS.ROOT_RADIUS
      : LAYOUT_CONSTANTS.NODE_RADIUS;
    parts.push(`<circle cx="${node.x}" cy="${node.y}" r="${r}" fill="${color}"/>`);

    // Progress arc (si > 0)
    if (node.progress > 0 && node.progress <= 100) {
      const arcPath = describeProgressArc(node.x, node.y, r + 3, node.progress);
      parts.push(`<path d="${arcPath}" fill="none" stroke="white" stroke-width="3" opacity="0.7"/>`);
    }
  }
  parts.push('</g>');

  // Labels — texte SVG
  parts.push('<g class="labels" fill="#e5e7eb" font-family="system-ui, sans-serif" font-size="12">');
  for (const node of nodes) {
    const isRight = node.angle >= -Math.PI / 2 && node.angle <= Math.PI / 2;
    const labelX = node.x + (isRight ? 1 : -1) * (LAYOUT_CONSTANTS.NODE_RADIUS + 6);
    const anchor = isRight ? 'start' : 'end';
    const truncated = truncateText(node.title, LAYOUT_CONSTANTS.LABEL_MAX_WIDTH);
    parts.push(`<text x="${labelX}" y="${node.y + 4}" text-anchor="${anchor}">${escapeXml(truncated)}</text>`);
  }
  parts.push('</g>');

  parts.push('</svg>');
  return parts.join('\n');
}
```

**Note sécurité :** `escapeXml()` est appliqué sur tous les textes insérés dans le SVG pour éviter toute injection XSS si les titres de nodes contiennent du HTML/XML.

```typescript
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

### 12.6 Impression (Print)

**Stratégie :** l'impression utilise l'export SVG injecté dans un `<iframe>` temporaire avec une feuille de style print.

```typescript
function handlePrint(layoutResult: MindmapLayoutResult): void {
  const svgString = exportToSvg(layoutResult, { includeBackground: false });

  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.left = '-9999px';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @page { size: landscape; margin: 1cm; }
          body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
          svg { max-width: 100%; max-height: 100vh; }
        </style>
      </head>
      <body>${svgString}</body>
    </html>
  `);
  doc.close();

  iframe.contentWindow!.addEventListener('afterprint', () => {
    document.body.removeChild(iframe);
  });

  iframe.contentWindow!.print();
}
```

**Décisions d'impression :**
- Orientation : paysage par défaut (la mindmap est plus large que haute).
- Fond : **pas de fond sombre** (économie d'encre). Les nodes sont rendus avec des couleurs pleines contrastant sur blanc.
- L'export SVG avec `includeBackground: false` produit un rendu adapté papier.

### 12.7 Impact architecture V1 pour le future-proofing

Pour que l'export V2 soit trivial à brancher, l'architecture Konva V1 respecte ces contraintes :

1. **Composants Konva découplés des données** — `MindmapEdgesLayer`, `MindmapNodesLayer`, `MindmapLabelsLayer` reçoivent les nodes/edges en props. Ils ne font que du rendu. Le même `layoutResult` est passé à l'export SVG (string generator) sans couplage avec Konva.

2. **Layout indépendant du viewport** — `computeRadialLayout()` retourne des coordonnées monde absolues, pas relatives au viewport utilisateur.

3. **Palette de couleurs centralisée** — `getNodeColor(node)` retourne un hex, réutilisable en SVG string et en Konva shapes.

4. **Export PNG via `stage.toDataURL()`** — Konva gère nativement l'export canvas de tous les Layers en un appel. Pas de code de rendu custom à maintenir en parallèle.

5. **Export SVG via string generator** — Konva n'a pas d'export SVG natif. Le générateur de string SVG (section 12.5) est indépendant de Konva et consomme directement le `layoutResult`. C'est un avantage : si Konva est remplacé par PixiJS, l'export SVG reste inchangé.

---

## Annexe A — Structure de fichiers finale

```
apps/frontend/src/
├── app/boards/[teamId]/[[...board]]/components/
│   ├── BoardMindmapView.tsx           # Composant React principal (<Stage> Konva + state + toolbar)
│   ├── BoardPageShell.tsx             # Modifié : ajout "mindmap" au view toggle
│   └── mindmap/
│       ├── mindmap-types.ts           # Types MindmapNode, MindmapEdge, NodeSnapshot, LabelPlacement
│       ├── mindmap-transform.ts       # Board → MindmapNode[] (INCHANGÉ — pur TS)
│       ├── mindmap-layout.ts          # computeRadialLayout(), computeAnchoredSweeps(), detectCollisions() (INCHANGÉ — pur TS)
│       ├── mindmap-labels.ts          # computeLabelPlacements() anti-collision (INCHANGÉ — pur TS)
│       ├── MindmapEdgesLayer.tsx       # <Layer listening={false}> Konva — courbes de Bézier (Path)
│       ├── MindmapNodesLayer.tsx       # <Layer> Konva — map visibleNodes → MindmapNodeShape
│       ├── MindmapLabelsLayer.tsx      # <Layer listening={false}> Konva — labels texte (conditionnel zoom ≥ 0.5)
│       ├── MindmapNodeShape.tsx        # Composant Konva : <Group> → <Circle> + <Arc> + <Circle badge>
│       ├── mindmap-animation.ts       # startLayoutTransition(), rAF ticker, snapshot diffing, refs Konva
│       └── mindmap-export.ts          # exportToPng() via stage.toDataURL() + exportToSvg() string gen (V2)
├── features/boards/
│   └── board-ui-settings.tsx          # Modifié : BoardViewMode += "mindmap"
```

**Fichiers supprimés par rapport à l'architecture Canvas natif initiale :**

| Fichier supprimé | Raison |
|---|---|
| `mindmap-renderer.ts` | Remplacé par 3 composants Konva Layer (`MindmapEdgesLayer`, `MindmapNodesLayer`, `MindmapLabelsLayer`) |
| `mindmap-hit-test.ts` | Konva gère le hit-testing nativement (onClick, onMouseEnter par shape) |

## Annexe B — Palette couleurs nodes

| `behaviorKey` | Couleur | Hex (Tailwind equiv.) |
|---|---|---|
| `BACKLOG` | Amber 400 | `#fbbf24` |
| `IN_PROGRESS` | Sky 400 | `#38bdf8` |
| `BLOCKED` | Rose 400 | `#fb7185` |
| `DONE` | Emerald 400 | `#34d399` |
| `CUSTOM` | Slate 400 | `#94a3b8` |
| Root node | Accent (violet) | Thème Stratum `var(--color-accent)` |

## Annexe C — Viewport : stagePos + stageScale (Konva)

Avec Konva, l'état du viewport n'est plus représenté par un type `Viewport` custom. Il est porté par les propriétés natives du `<Stage>` Konva :

```typescript
// Dans BoardMindmapView.tsx
const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
const [stageScale, setStageScale] = useState(1);

// Passés directement au <Stage> :
// <Stage x={stagePos.x} y={stagePos.y} scaleX={stageScale} scaleY={stageScale} ... />
```

**Correspondance avec l'ancien type `Viewport` :**

| Ancien `Viewport` | Équivalent Konva |
|---|---|
| `viewport.x` (centre monde) | `stagePos.x` (offset du Stage en pixels écran) |
| `viewport.y` (centre monde) | `stagePos.y` (offset du Stage en pixels écran) |
| `viewport.scale` | `stageScale` (appliqué via `scaleX`/`scaleY` du Stage) |
| `viewport.width` | `containerWidth` (via `useContainerSize(containerRef)`) |
| `viewport.height` | `containerHeight` (via `useContainerSize(containerRef)`) |

**Conversion monde → écran :** `screenX = worldX * stageScale + stagePos.x`

**Conversion écran → monde :** `worldX = (screenX - stagePos.x) / stageScale`

---

## 13. Plan de migration et interchangeabilité du renderer

### 13.1 Architecture découplée layout/renderer

Le choix architectural fondamental est le **découplage complet** entre le layout (algorithme de placement) et le renderer (affichage à l'écran). Cela rend le renderer interchangeable sans modifier la logique métier.

```
┌──────────────────────────────┐
│   Données (Board + Nodes)    │  ← useBoardData(), API REST
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│   mindmap-transform.ts       │  ← Board → MindmapNode[]
│   (pur TS, aucune dépendance)│
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│   mindmap-layout.ts          │  ← MindmapNode[] → LayoutResult (x, y, angle, bounds)
│   (pur TS, déterministe)     │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────────────────────────────┐
│   RENDERER (interchangeable)                          │
│                                                       │
│   V1 : Konva (react-konva)                           │
│   ├── MindmapEdgesLayer.tsx                          │
│   ├── MindmapNodesLayer.tsx                          │
│   ├── MindmapLabelsLayer.tsx                         │
│   └── MindmapNodeShape.tsx                           │
│                                                       │
│   Migration possible :                                │
│   ├── PixiJS (@pixi/react) si > 2000 nodes visibles │
│   └── SVG natif si < 200 nodes et édition vecteur    │
└──────────────────────────────────────────────────────┘
```

### 13.2 Contrat du renderer

Tout renderer doit respecter ce contrat :

1. **Input** : `LayoutResult` (nodes avec x/y, edges, bounds) + état UI (selectedId, hoveredId, collapsedIds).
2. **Output** : rendu visuel avec interactions (click, hover, expand, double-click).
3. **Callbacks** : `onSelect(nodeId)`, `onExpand(nodeId)`, `onOpenTask(nodeId)`, `onHoverStart(nodeId)`, `onHoverEnd(nodeId)`.
4. **Animations** : transition de positions lors des changements de layout (même snapshot from/to).
5. **Export PNG** : capacité à capturer le rendu complet en image.

### 13.3 Scénarios de migration

| Déclencheur | De | Vers | Effort estimé |
|---|---|---|---|
| > 2000 nodes visibles à 60fps requis | Konva (Canvas 2D) | PixiJS (WebGL) | ~3-5 jours (réécrire les 4 composants Layer/Shape) |
| Besoin d'édition vectorielle in-app | Konva (Canvas 2D) | SVG + React | ~2-3 jours (si < 200 nodes) |
| Konva deprecated / unmaintained | Konva | PixiJS ou Fabric.js | ~3-5 jours |

### 13.4 Ce qui ne change PAS lors d'une migration renderer

- `mindmap-types.ts` — inchangé
- `mindmap-transform.ts` — inchangé
- `mindmap-layout.ts` — inchangé
- `mindmap-labels.ts` — inchangé
- `mindmap-animation.ts` — la logique de snapshot diffing est réutilisable, seule l'application des valeurs interpolées change (Konva refs → PixiJS refs)
- `mindmap-export.ts` (SVG) — l'export SVG string est indépendant du renderer
- Tous les types, la logique d'état, le lazy-loading, l'AbortController, la queue de concurrence
