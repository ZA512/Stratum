"use client";
import React, { useState, FormEvent, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/features/auth/auth-provider';
import { useBoardData } from '@/features/boards/board-data-provider';
import { useAutoRefreshBoard } from '@/features/boards/useAutoRefreshBoard';
import { useTaskDrawer } from '@/features/nodes/task-drawer/TaskDrawerContext';
import { useToast } from '@/components/toast/ToastProvider';
import { useTranslation } from '@/i18n';
import { useHelpMode } from '@/hooks/useHelpMode';
import {
  createBoardColumn,
  updateBoardColumn,
  deleteBoardColumn,
  fetchArchivedNodes,
  type UpdateBoardColumnInput,
  type BoardNode,
  type ColumnBehaviorKey,
  type ArchivedBoardNode,
} from '@/features/boards/boards-api';
import {
  createNode,
  updateNode,
  moveChildNode,
  moveSharedNodePlacement,
  deleteNode as apiDeleteNode,
  fetchNodeDeletePreview,
  type NodeDeletePreview,
} from '@/features/nodes/nodes-api';
import {
  fetchNodeCollaborators,
  type NodeCollaboratorsResponse,
} from '@/features/nodes/node-collaborators-api';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent, closestCorners, DragStartEvent, DragOverlay, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ColumnList } from './ColumnList';
import type { BoardColumnWithNodes, CardDisplayOptions } from './types';
import { useBoardUiSettings } from '@/features/boards/board-ui-settings';
import { MoveCardDialog } from './MoveCardDialog';
import { AdvancedFiltersPanel } from './AdvancedFiltersPanel';
import { readBacklogSettings, readDoneSettings } from './settings-helpers';
import { HelpTooltip } from '@/components/ui/help-tooltip';


type PriorityValue = 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
type EffortValue = 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL';
const NO_EFFORT_TOKEN = '__NO_EFFORT__' as const;
type EffortFilterValue = EffortValue | typeof NO_EFFORT_TOKEN;

const CARD_DISPLAY_DEFAULTS: CardDisplayOptions = {
  showShortId: true,
  showPriority: true,
  showOwner: true,
  showDueDate: true,
  showProgress: true,
  showEffort: true,
  showDescription: true,
  columnHeight: 'auto',
};

const BACKLOG_SETTINGS_DEFAULTS = {
  reviewAfterDays: 14,
  reviewEveryDays: 7,
  archiveAfterDays: 60,
};

const DONE_SETTINGS_DEFAULTS = {
  archiveAfterDays: 30,
};

// --- Stratégie de collision personnalisée ---
// Problème observé: lorsqu'on dépose une carte sur une colonne vide (ex: "En Test"),
// closestCorners retourne parfois une carte d'une colonne adjacente (ex: Bloqué), entraînant un routage erroné.
// Solution: on tente d'abord pointerWithin (zones sous le pointeur). Si une zone colonne (type 'column-drop') est présente,
// on la priorise. Sinon on retombe sur l'algo closestCorners d'origine.
const collisionDetectionStrategy: CollisionDetection = (args) => {
  // Collisions directes sous le pointeur
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prioriser explicitement les zones de colonnes (column-drop) pour les colonnes vides
    pointerCollisions.sort((a, b) => {
      const aContainer = args.droppableContainers.find(c => c.id === a.id);
      const bContainer = args.droppableContainers.find(c => c.id === b.id);
      const aType = (aContainer?.data?.current as { type?: string } | undefined)?.type;
      const bType = (bContainer?.data?.current as { type?: string } | undefined)?.type;
      const aScore = aType === 'column-drop' ? 0 : 1;
      const bScore = bType === 'column-drop' ? 0 : 1;
      return aScore - bScore;
    });
    return pointerCollisions;
  }
  // Fallback comportement existant
  return closestCorners(args);
};

const DISPLAY_TOGGLE_CONFIG: Array<{ key: keyof CardDisplayOptions; labelKey: string }> = [
  { key: 'showShortId', labelKey: 'filters.display.options.shortId' },
  { key: 'showPriority', labelKey: 'filters.display.options.priority' },
  { key: 'showOwner', labelKey: 'filters.display.options.owner' },
  { key: 'showDueDate', labelKey: 'filters.display.options.dueDate' },
  { key: 'showProgress', labelKey: 'filters.display.options.progress' },
  { key: 'showEffort', labelKey: 'filters.display.options.effort' },
  { key: 'showDescription', labelKey: 'filters.display.options.description' },
];

const PRIORITY_DEFINITIONS: Array<{ value: PriorityValue }> = [
  { value: 'CRITICAL' },
  { value: 'HIGH' },
  { value: 'MEDIUM' },
  { value: 'LOW' },
  { value: 'LOWEST' },
  { value: 'NONE' },
];

const EFFORT_OPTIONS: Array<{ value: EffortValue; label: string }> = [
  { value: 'UNDER2MIN', label: '< 2 min' },
  { value: 'XS', label: 'XS' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: 'XXL', label: 'XXL' },
];

const EFFORT_LABELS: Record<EffortValue, string> = EFFORT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<EffortValue, string>);

const TOKEN_REGEX = /[@#!]"[^"]*"|[@#!][^\s"]+|"[^"]+"|[^\s]+/g;

type ParsedSearchQuery = {
  hasQuery: boolean;
  textTerms: string[];
  mentionTerms: string[];
  priorityValues: PriorityValue[];
  shortIdTerms: string[];
};

const normalizeSearchString = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const parseSearchQuery = (raw: string, priorityLabels: Record<PriorityValue, string>): ParsedSearchQuery => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { hasQuery: false, textTerms: [], mentionTerms: [], priorityValues: [], shortIdTerms: [] };
  }

  const tokens = trimmed.match(TOKEN_REGEX) ?? [];
  const textTerms: string[] = [];
  const mentionTerms: string[] = [];
  const priorityValues = new Set<PriorityValue>();
  const shortIdTerms: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    let prefix: '@' | '!' | '#' | null = null;
    let content = token;
    if (content.startsWith('@') || content.startsWith('!') || content.startsWith('#')) {
      prefix = content[0] as '@' | '!' | '#';
      content = content.slice(1);
    }

    if (content.startsWith('"') && content.endsWith('"') && content.length >= 2) {
      content = content.slice(1, -1);
    }

    const normalizedContent = normalizeSearchString(content);

    if (prefix === '@') {
      if (normalizedContent) {
        mentionTerms.push(normalizedContent);
      }
      continue;
    }

    if (prefix === '!') {
      if (!normalizedContent) continue;
      const matches = PRIORITY_DEFINITIONS.filter(({ value }) => {
        const normalizedLabel = normalizeSearchString(priorityLabels[value] ?? '');
        const normalizedValue = normalizeSearchString(value);
        return normalizedLabel.includes(normalizedContent) || normalizedValue.includes(normalizedContent);
      });
      if (matches.length > 0) {
        matches.forEach((match) => priorityValues.add(match.value));
        continue;
      }
      // if nothing matched, treat as general text token
    }

    if (prefix === '#') {
      const digits = content.replace(/[^0-9]/g, '');
      if (digits) {
        shortIdTerms.push(digits);
        continue;
      }
      // fallback to text token if no digits
    }

    if (!normalizedContent) continue;
    if (normalizedContent.length < 3) continue;
    textTerms.push(normalizedContent);
  }

  return {
    hasQuery: textTerms.length > 0 || mentionTerms.length > 0 || priorityValues.size > 0 || shortIdTerms.length > 0,
    textTerms,
    mentionTerms,
    priorityValues: Array.from(priorityValues),
    shortIdTerms,
  };
};

// ------------------------------------------------------------------
// Composant principal (restauration d'états perdus dans refactor).
// ------------------------------------------------------------------
// NOTE: La définition originale de TeamBoardPage a été déplacée / tronquée.
// On conserve ici une reconstruction complète minimaliste + TODO pour réintégrer
// l'ensemble des handlers si nécessaire.
function BoardSkeleton(){
  return (
    <div className="flex gap-4 overflow-x-auto">
      {Array.from({length:4}).map((_,i)=>(
        <div key={i} className="min-w-[280px] animate-pulse rounded-2xl border border-white/10 bg-card/40 p-5">
          <div className="h-5 w-3/4 rounded bg-white/15" />
          <div className="mt-4 h-4 w-1/2 rounded bg-white/10" />
          <div className="mt-4 h-24 rounded-xl bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export function TeamBoardPage(){
  const { user, accessToken, logout } = useAuth();
  const { board, status, error, refreshActiveBoard, childBoards, teamId, openChildBoard, activeBoardId } = useBoardData();
  const { open } = useTaskDrawer();
  const { success, error: toastError } = useToast();
  const { t } = useTranslation();
  const { t: tBoard } = useTranslation("board");
  const { expertMode, setExpertMode } = useBoardUiSettings();
  const { helpMode, toggleHelpMode } = useHelpMode();

  // 🔄 Auto-refresh intelligent avec polling optimisé (15 sec, ETag, visibilité onglet)
  useAutoRefreshBoard({
    intervalMs: 15000, // 15 secondes
    onRefresh: refreshActiveBoard,
    enabled: true,
    boardId: activeBoardId,
  });

  const loading = status==='loading' && !board;
  const detailLoading = status==='loading' && !!board;


  const showBoardControls = true;

  // New column form state
  const [isAddingColumn,setIsAddingColumn] = useState(false);
  const [columnName,setColumnName] = useState('');
  const [columnBehavior,setColumnBehavior] = useState<'BACKLOG'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CUSTOM'>('BACKLOG');
  const [columnWip,setColumnWip] = useState('');
  const [columnError,setColumnError] = useState<string|null>(null);
  const [columnSubmitting,setColumnSubmitting] = useState(false);

  // Edit column state
  const [editingColumnId,setEditingColumnId] = useState<string|null>(null);
  const [editingName,setEditingName] = useState('');
  const [editingWip,setEditingWip] = useState('');
  const [editingBacklogReviewAfter, setEditingBacklogReviewAfter] = useState('');
  const [editingBacklogReviewEvery, setEditingBacklogReviewEvery] = useState('');
  const [editingBacklogArchiveAfter, setEditingBacklogArchiveAfter] = useState('');
  const [editingDoneArchiveAfter, setEditingDoneArchiveAfter] = useState('');
  const [editingError,setEditingError] = useState<string|null>(null);
  const [editingSubmitting,setEditingSubmitting] = useState(false);

  // DnD + état optimiste
  const sensors = useSensors(useSensor(PointerSensor,{ activationConstraint:{ distance:5 }}));
  const [optimisticColumns,setOptimisticColumns] = useState<BoardColumnWithNodes[] | null>(null);
  const [draggingCard,setDraggingCard] = useState<{ id:string; title:string } | null>(null);
  const UNASSIGNED_TOKEN = '__UNASSIGNED__';
  const [hideDone,setHideDone] = useState(false);
  const [displayOptions, setDisplayOptions] = useState<CardDisplayOptions>(() => ({ ...CARD_DISPLAY_DEFAULTS }));
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<PriorityValue[]>([]);
  const [selectedEfforts, setSelectedEfforts] = useState<EffortFilterValue[]>([]);
  const [filterMine, setFilterMine] = useState(false);
  const [filterHasChildren, setFilterHasChildren] = useState(false);
  const [sortPriority, setSortPriority] = useState(false);
  const [sortDueDate, setSortDueDate] = useState(false);
  // États de recherche / panneau avancé restaurés
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  // états déjà uniques (pas de doublon plus haut désormais)
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const searchBlurTimeout = useRef<number | null>(null);
  const archivedColumnIdRef = useRef<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<BoardNode | null>(null);
  const [deletePreview, setDeletePreview] = useState<NodeDeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState<'single' | 'recursive' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteShareSummary, setDeleteShareSummary] = useState<NodeCollaboratorsResponse | null>(null);
  const [deleteShareError, setDeleteShareError] = useState<string | null>(null);
  const [archivedColumn, setArchivedColumn] = useState<{
    id: string;
    name: string;
    behavior: ColumnBehaviorKey;
  } | null>(null);
  const [archivedNodes, setArchivedNodes] = useState<ArchivedBoardNode[]>([]);
  // Mode d'affichage par colonne: null = normal, 'snoozed' = voir snoozées, 'archived' = voir archivées
  const [columnViewMode, setColumnViewMode] = useState<Record<string, 'snoozed' | 'archived' | null>>({});
  const storageKey = board?.id ? `stratum:board:${board.id}:filters` : null;
  const advancedFiltersActive =
    selectedAssignees.length > 0 ||
    selectedPriorities.length > 0 ||
    selectedEfforts.length > 0 ||
    hideDone ||
    filterHasChildren;

  const rawColumns: BoardColumnWithNodes[] | undefined = optimisticColumns ?? (board?.columns as BoardColumnWithNodes[] | undefined);
  const effectiveColumns: BoardColumnWithNodes[] | undefined = useMemo(()=>{
    if(!rawColumns) return rawColumns;
    if(!hideDone) return rawColumns;
    return rawColumns.filter(c=>c.behaviorKey !== 'DONE');
  }, [rawColumns, hideDone]);

  useEffect(() => {
    return () => {
      if (searchBlurTimeout.current !== null) {
        window.clearTimeout(searchBlurTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchDraft.trim();
      if (!trimmed) {
        setSearchQuery('');
        return;
      }
      const containsSpecialToken = /[@#!]/.test(trimmed);
      if (trimmed.length >= 3 || containsSpecialToken) {
        setSearchQuery(trimmed);
      } else {
        setSearchQuery('');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  useEffect(() => {
    if (!storageKey) {
      setFiltersHydrated(false);
      return;
    }
    if (typeof window === 'undefined') return;

    setSelectedAssignees([]);
    setSelectedPriorities([]);
    setSelectedEfforts([]);
    setFilterMine(false);
    setFilterHasChildren(false);
    setSortPriority(false);
    setSortDueDate(false);
    setSearchDraft('');
    setSearchQuery('');
    setHideDone(false);
    setDisplayOptions({ ...CARD_DISPLAY_DEFAULTS });

    const raw = window.localStorage.getItem(storageKey);
    if (raw && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as {
          hideDone?: unknown;
          showDescriptions?: unknown;
          displayOptions?: unknown;
          selectedAssignees?: unknown;
          selectedPriorities?: unknown;
          selectedEfforts?: unknown;
          filterMine?: unknown;
          filterHasChildren?: unknown;
          sortPriority?: unknown;
          sortDueDate?: unknown;
          search?: unknown;
        };
        if (typeof parsed.hideDone === 'boolean') setHideDone(parsed.hideDone);
        if (parsed.displayOptions && typeof parsed.displayOptions === 'object') {
          const nextDisplay = { ...CARD_DISPLAY_DEFAULTS };
          for (const key of Object.keys(nextDisplay) as Array<keyof CardDisplayOptions>) {
            const value = (parsed.displayOptions as Record<string, unknown>)[key];
            if (key === 'columnHeight') {
              if (value === 'auto' || value === 'fixed') {
                nextDisplay[key] = value;
              }
            } else if (typeof value === 'boolean') {
              nextDisplay[key] = value as boolean & ('auto' | 'fixed');
            }
          }
          setDisplayOptions(nextDisplay);
        } else if (typeof parsed.showDescriptions === 'boolean') {
          setDisplayOptions((prev) => ({ ...prev, showDescription: parsed.showDescriptions as boolean }));
        }
        if (Array.isArray(parsed.selectedAssignees) && parsed.selectedAssignees.every((value) => typeof value === 'string'))
          setSelectedAssignees(parsed.selectedAssignees);
        if (
          Array.isArray(parsed.selectedPriorities) &&
          parsed.selectedPriorities.every((value) =>
            value === 'NONE' ||
            value === 'CRITICAL' ||
            value === 'HIGH' ||
            value === 'MEDIUM' ||
            value === 'LOW' ||
            value === 'LOWEST'
          )
        )
          setSelectedPriorities(parsed.selectedPriorities);
        if (
          Array.isArray(parsed.selectedEfforts) &&
          parsed.selectedEfforts.every(
            (value) =>
              value === NO_EFFORT_TOKEN ||
              value === 'UNDER2MIN' ||
              value === 'XS' ||
              value === 'S' ||
              value === 'M' ||
              value === 'L' ||
              value === 'XL' ||
              value === 'XXL'
          )
        )
          setSelectedEfforts(parsed.selectedEfforts);
        if (typeof parsed.filterMine === 'boolean') setFilterMine(parsed.filterMine);
        if (typeof parsed.filterHasChildren === 'boolean')
          setFilterHasChildren(parsed.filterHasChildren);
        if (typeof parsed.sortPriority === 'boolean') setSortPriority(parsed.sortPriority);
        if (typeof parsed.sortDueDate === 'boolean') setSortDueDate(parsed.sortDueDate);
        if (typeof parsed.search === 'string') {
          setSearchDraft(parsed.search);
          const trimmed = parsed.search.trim();
          if (!trimmed) {
            setSearchQuery('');
          } else if (trimmed.length >= 3 || /[@#!]/.test(trimmed)) {
            setSearchQuery(trimmed);
          } else {
            setSearchQuery('');
          }
        }
      } catch {
        // Ignore corrupted payloads; defaults already applied.
      }
    }
    setFiltersHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !filtersHydrated) return;
    if (typeof window === 'undefined') return;
    const payload = {
      hideDone,
      displayOptions,
      showDescriptions: displayOptions.showDescription,
      selectedAssignees,
      selectedPriorities,
      selectedEfforts,
      filterMine,
      filterHasChildren,
      sortPriority,
      sortDueDate,
      search: searchDraft,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Storage may be unavailable (quota, private mode); fail silently.
    }
  }, [storageKey, filtersHydrated, hideDone, displayOptions, selectedAssignees, selectedPriorities, selectedEfforts, filterMine, filterHasChildren, sortPriority, sortDueDate, searchDraft]);

  const allAssignees = useMemo(() => {
    const map = new Map<string, { id: string; displayName: string }>();
    if (!board?.columns) return [] as Array<{ id: string; displayName: string }>;
    for (const column of board.columns) {
      const nodes = column.nodes ?? [];
      for (const node of nodes) {
        const assignees = node.assignees ?? [];
        for (const assignee of assignees) {
          if (!map.has(assignee.id)) {
            map.set(assignee.id, { id: assignee.id, displayName: assignee.displayName });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }));
  }, [board?.columns]);

  const assigneeOptions = useMemo(
    () => [
      {
        id: UNASSIGNED_TOKEN,
        label: tBoard('filters.assignees.optionUnassigned.label'),
        description: tBoard('filters.assignees.optionUnassigned.description'),
        searchText: `${tBoard('filters.assignees.optionUnassigned.searchTerms')} unassigned none`,
      },
      ...allAssignees.map((assignee) => ({
        id: assignee.id,
        label: assignee.displayName,
        searchText: assignee.displayName,
      })),
    ],
    [allAssignees, tBoard],
  );

  const priorityOptions = useMemo(
    () => PRIORITY_DEFINITIONS.map(({ value }) => ({
      value,
      label: tBoard(`priority.labels.${value}` as const),
    })),
    [tBoard],
  );

  const priorityLabelMap = useMemo(() => {
    const map = {} as Record<PriorityValue, string>;
    for (const option of priorityOptions) {
      map[option.value] = option.label;
    }
    return map;
  }, [priorityOptions]);

  const parsedSearch = useMemo(() => parseSearchQuery(searchQuery, priorityLabelMap), [searchQuery, priorityLabelMap]);

  const mentionContext = useMemo(() => {
    if (!searchFocused) return null;
    const match = searchDraft.match(/(?:^|\s)(@(?:"[^"]*|[^\s@]*))$/);
    if (!match) return null;
    const token = match[1];
    const base = searchDraft.slice(0, searchDraft.length - token.length);
    let query = token.slice(1);
    if (query.startsWith('"')) {
      query = query.slice(1);
    }
    query = query.replace(/"$/g, '');
    return { base, query };
  }, [searchDraft, searchFocused]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) return [] as Array<{ id: string; displayName: string }>;
    const normalizedQuery = normalizeSearchString(mentionContext.query);
    if (!normalizedQuery) return allAssignees;
    return allAssignees.filter((assignee) =>
      normalizeSearchString(assignee.displayName).includes(normalizedQuery)
    );
  }, [mentionContext, allAssignees]);

  const handleMentionSelect = (displayName: string) => {
    if (!mentionContext) return;
    const baseNeedsSpace = mentionContext.base.length > 0 && !/\s$/.test(mentionContext.base);
    const prefix = baseNeedsSpace ? `${mentionContext.base} ` : mentionContext.base;
    const nextDraft = `${prefix}@"${displayName}" `;
    setSearchDraft(nextDraft);
  };

  useEffect(() => {
    if (!filtersExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFiltersExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtersExpanded]);

  const displayedColumns: BoardColumnWithNodes[] | undefined = useMemo(() => {
    if (!effectiveColumns) return effectiveColumns;

    const priorityWeight: Record<PriorityValue, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      LOWEST: 4,
      NONE: 5,
    };

    const matchesSearch = (card: BoardNode) => {
      if (!parsedSearch.hasQuery) return true;
      const priorityValue = (card.priority ?? 'NONE') as PriorityValue;
      const effortValue = card.effort ?? null;
      const normalizedTitle = normalizeSearchString(card.title);
      const normalizedDescription = normalizeSearchString(card.description ?? '');
  const normalizedPriorityLabel = normalizeSearchString(priorityLabelMap[priorityValue] ?? '');
      const normalizedPriorityValue = normalizeSearchString(priorityValue);
      const normalizedEffortLabel = effortValue ? normalizeSearchString(EFFORT_LABELS[effortValue]) : '';
      const normalizedEffortValue = effortValue ? normalizeSearchString(effortValue) : '';
      const normalizedId = (card.id ?? '').toLowerCase();
      const shortId = card.shortId ? String(card.shortId) : '';
      const haystacks = [
        normalizedTitle,
        normalizedDescription,
        normalizedPriorityLabel,
        normalizedPriorityValue,
        normalizedEffortLabel,
        normalizedEffortValue,
        normalizedId,
      ];
      if (shortId) haystacks.push(shortId);
      if (!parsedSearch.textTerms.every((term) => haystacks.some((value) => value.includes(term)))) {
        return false;
      }
      if (parsedSearch.shortIdTerms.length > 0) {
        if (!shortId) return false;
        if (!parsedSearch.shortIdTerms.every((term) => shortId.includes(term))) return false;
      }
      if (parsedSearch.priorityValues.length > 0 && !parsedSearch.priorityValues.includes(priorityValue)) {
        return false;
      }
      if (parsedSearch.mentionTerms.length > 0) {
        const normalizedAssignees = (card.assignees ?? []).map((assignee) =>
          normalizeSearchString(assignee.displayName)
        );
        if (!parsedSearch.mentionTerms.every((term) => normalizedAssignees.some((name) => name.includes(term)))) {
          return false;
        }
      }
      return true;
    };

    return effectiveColumns.map((column) => {
      const baseCards = [...(column.nodes ?? [])].sort((a, b) => a.position - b.position);
      let filtered = baseCards;

      if (selectedAssignees.length > 0) {
        filtered = filtered.filter((card) => {
          const assignees = card.assignees ?? [];
          const hasAssignments = assignees.length > 0;
          const includeUnassigned = selectedAssignees.includes(UNASSIGNED_TOKEN);
          if (!hasAssignments && includeUnassigned) return true;
          if (!hasAssignments) return false;
          const assigneeIds = new Set(assignees.map((a) => a.id));
          return selectedAssignees.some((id) => id !== UNASSIGNED_TOKEN && assigneeIds.has(id));
        });
      }

      if (selectedPriorities.length > 0) {
        filtered = filtered.filter((card) => selectedPriorities.includes((card.priority ?? 'NONE') as PriorityValue));
      }

      if (selectedEfforts.length > 0) {
        filtered = filtered.filter((card) => {
          const effort = card.effort ?? null;
          return selectedEfforts.some((value) =>
            value === NO_EFFORT_TOKEN ? effort === null : effort === value
          );
        });
      }

      if (filterMine && user?.id) {
        filtered = filtered.filter((card) => (card.assignees ?? []).some((a) => a.id === user.id));
      }

      if (filterHasChildren) {
        filtered = filtered.filter((card) => Boolean(childBoards[card.id]));
      }

      if (parsedSearch.hasQuery) {
        filtered = filtered.filter((card) => matchesSearch(card));
      }

      if (sortPriority || sortDueDate) {
        filtered = [...filtered].sort((a, b) => {
          if (sortPriority) {
            const pa = priorityWeight[(a.priority ?? 'NONE') as PriorityValue];
            const pb = priorityWeight[(b.priority ?? 'NONE') as PriorityValue];
            if (pa !== pb) return pa - pb;
          }
          if (sortDueDate) {
            const da = a.dueAt ? new Date(a.dueAt).getTime() : null;
            const db = b.dueAt ? new Date(b.dueAt).getTime() : null;
            if (da !== db) {
              if (da === null) return 1;
              if (db === null) return -1;
              return da - db;
            }
          }
          return a.position - b.position;
        });
      }

      return { ...column, nodes: filtered };
    });
  }, [effectiveColumns, selectedAssignees, selectedPriorities, selectedEfforts, filterMine, user?.id, filterHasChildren, childBoards, parsedSearch, sortPriority, sortDueDate, priorityLabelMap]);

  const resetColumnForm = () => { setColumnName(''); setColumnBehavior('BACKLOG'); setColumnWip(''); setColumnError(null); };

  // --- Utilitaire de gestion d'appels API avec toasts centralisés ---
  async function handleApi<T>(op:()=>Promise<T>, opts?: { success?: string; warnWip?: string; }) {
    try {
      const result = await op();
      if (opts?.success) success(opts.success);
      return result;
    } catch (e) {
      const err = e as Error & { status?: number; message?: string };
      const msg = (err?.message || '').toLowerCase();
      // Détection 401 élargie (status ou message)
      if (err.status === 401 || msg.includes('401') || msg.includes('unauthorized')) {
        toastError(tBoard('alerts.sessionExpired'));
        // logout() effectue déjà la redirection vers /login
        logout();
        return Promise.reject(err);
      }
      if (msg.includes('wip')) {
        toastError(opts?.warnWip || tBoard('alerts.wipLimitReached'));
      } else {
        toastError(err.message || tBoard('alerts.unexpectedError'));
      }
      throw err;
    }
  }

  const handleSubmitColumn = async (e:FormEvent) => {
    e.preventDefault();
    if(!accessToken || !board){ setColumnError(tBoard('columns.form.errors.sessionInvalid')); return; }
    if(!columnName.trim()){ setColumnError(tBoard('columns.form.errors.nameRequired')); return; }
  const payload: { name: string; behaviorKey: 'BACKLOG'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CUSTOM'; wipLimit?: number|null } = { name: columnName.trim(), behaviorKey: columnBehavior };
    if(columnWip.trim()){
      const n = parseInt(columnWip.trim(),10);
      if(!Number.isFinite(n) || n<=0){ setColumnError(tBoard('columns.form.errors.wipInvalid')); return; }
      payload.wipLimit = n;
    }
    setColumnSubmitting(true); setColumnError(null);
    try {
      await handleApi(()=>createBoardColumn(board.id, payload, accessToken), { success: tBoard('columns.notifications.created') });
      await refreshActiveBoard();
      setIsAddingColumn(false); resetColumnForm();
  } catch(e){ setColumnError((e as Error).message); } finally { setColumnSubmitting(false); }
  };

  const resetEditingFields = () => {
    setEditingName('');
    setEditingWip('');
    setEditingBacklogReviewAfter('');
    setEditingBacklogReviewEvery('');
    setEditingBacklogArchiveAfter('');
    setEditingDoneArchiveAfter('');
    setEditingError(null);
  };

  const handleOpenColumnEditorById = (columnId:string) => {
    if(!board) return;
    const c = board.columns.find(col=>col.id===columnId) as BoardColumnWithNodes | undefined;
    if(!c) return;
    const backlogSnapshot =
      c.behaviorKey === 'BACKLOG'
        ? readBacklogSettings(c.settings ?? null)
        : null;
    const doneSnapshot =
      c.behaviorKey === 'DONE'
        ? readDoneSettings(c.settings ?? null)
        : null;
    setEditingColumnId(c.id);
    setEditingName(c.name);
    setEditingWip(c.wipLimit?String(c.wipLimit):'');
    if (c.behaviorKey === 'BACKLOG') {
      const reviewAfter =
        backlogSnapshot?.reviewAfterDays ?? BACKLOG_SETTINGS_DEFAULTS.reviewAfterDays;
      const reviewEvery =
        backlogSnapshot?.reviewEveryDays ?? BACKLOG_SETTINGS_DEFAULTS.reviewEveryDays;
      const archiveAfter =
        backlogSnapshot?.archiveAfterDays ?? BACKLOG_SETTINGS_DEFAULTS.archiveAfterDays;
      setEditingBacklogReviewAfter(String(reviewAfter));
      setEditingBacklogReviewEvery(String(reviewEvery));
      setEditingBacklogArchiveAfter(String(archiveAfter));
    } else {
      setEditingBacklogReviewAfter('');
      setEditingBacklogReviewEvery('');
      setEditingBacklogArchiveAfter('');
    }
    if (c.behaviorKey === 'DONE') {
      const archiveAfter =
        doneSnapshot?.archiveAfterDays ?? DONE_SETTINGS_DEFAULTS.archiveAfterDays;
      setEditingDoneArchiveAfter(String(archiveAfter));
    } else {
      setEditingDoneArchiveAfter('');
    }
    setEditingError(null);
  };
  const handleCancelEditColumn = () => {
    setEditingColumnId(null);
    resetEditingFields();
  };

  const handleUpdateColumn = async () => {
    if(!accessToken || !board || !editingColumnId) return;
    const col = board.columns.find(c=>c.id===editingColumnId); if(!col) return;
  const name = editingName.trim();
  if(!name){ setEditingError(tBoard('columns.form.errors.nameRequired')); return; }
    const updates: UpdateBoardColumnInput = {};
    if(name !== col.name) updates.name = name;
    const w = editingWip.trim();
    if(w===''){ if(col.wipLimit !== null) updates.wipLimit = null; }
    else {
      const n = Number(w);
  if(!Number.isInteger(n) || n<=0){ setEditingError(tBoard('columns.form.errors.wipInvalid')); return; }
      if(col.wipLimit !== n) updates.wipLimit = n;
    }

    const backlogSnapshot =
      col.behaviorKey === 'BACKLOG'
        ? readBacklogSettings(col.settings ?? null)
        : null;
    const doneSnapshot =
      col.behaviorKey === 'DONE'
        ? readDoneSettings(col.settings ?? null)
        : null;

    let hasSettingsChange = false;

    if (col.behaviorKey === 'BACKLOG') {
      const reviewAfterRaw = editingBacklogReviewAfter.trim();
      const reviewEveryRaw = editingBacklogReviewEvery.trim();
      const archiveAfterRaw = editingBacklogArchiveAfter.trim();
      if (!reviewAfterRaw || !reviewEveryRaw || !archiveAfterRaw) {
        setEditingError(tBoard('columns.form.errors.backlogDelaysRequired'));
        return;
      }
      const reviewAfter = Number(reviewAfterRaw);
      const reviewEvery = Number(reviewEveryRaw);
      const archiveAfter = Number(archiveAfterRaw);
      if (!Number.isInteger(reviewAfter) || reviewAfter < 1 || reviewAfter > 365) {
        setEditingError(tBoard('columns.form.errors.backlogReviewAfterRange'));
        return;
      }
      if (!Number.isInteger(reviewEvery) || reviewEvery < 1 || reviewEvery > 365) {
        setEditingError(tBoard('columns.form.errors.backlogReviewEveryRange'));
        return;
      }
      if (!Number.isInteger(archiveAfter) || archiveAfter < 1 || archiveAfter > 730) {
        setEditingError(tBoard('columns.form.errors.backlogArchiveRange'));
        return;
      }
      const currentReviewAfter =
        backlogSnapshot?.reviewAfterDays ?? BACKLOG_SETTINGS_DEFAULTS.reviewAfterDays;
      const currentReviewEvery =
        backlogSnapshot?.reviewEveryDays ?? BACKLOG_SETTINGS_DEFAULTS.reviewEveryDays;
      const currentArchiveAfter =
        backlogSnapshot?.archiveAfterDays ?? BACKLOG_SETTINGS_DEFAULTS.archiveAfterDays;
      const backlogSettingsUpdates: NonNullable<UpdateBoardColumnInput['backlogSettings']> = {};
      if (reviewAfter !== currentReviewAfter) backlogSettingsUpdates.reviewAfterDays = reviewAfter;
      if (reviewEvery !== currentReviewEvery) backlogSettingsUpdates.reviewEveryDays = reviewEvery;
      if (archiveAfter !== currentArchiveAfter) backlogSettingsUpdates.archiveAfterDays = archiveAfter;
      if (Object.keys(backlogSettingsUpdates).length > 0) {
        updates.backlogSettings = backlogSettingsUpdates;
        hasSettingsChange = true;
      }
    }

    if (col.behaviorKey === 'DONE') {
      const archiveAfterRaw = editingDoneArchiveAfter.trim();
      if (!archiveAfterRaw) {
        setEditingError(tBoard('columns.form.errors.doneArchiveRequired'));
        return;
      }
      const archiveAfter = Number(archiveAfterRaw);
      if (!Number.isInteger(archiveAfter) || archiveAfter < 0 || archiveAfter > 730) {
        setEditingError(tBoard('columns.form.errors.doneArchiveRange'));
        return;
      }
      const currentArchiveAfter =
        doneSnapshot?.archiveAfterDays ?? DONE_SETTINGS_DEFAULTS.archiveAfterDays;
      if (archiveAfter !== currentArchiveAfter) {
        updates.doneSettings = { archiveAfterDays: archiveAfter };
        hasSettingsChange = true;
      }
    }

    const hasStructuralUpdate =
      updates.name !== undefined || updates.wipLimit !== undefined || updates.position !== undefined;
    if(!hasStructuralUpdate && !hasSettingsChange){
      setEditingColumnId(null);
      resetEditingFields();
      return;
    }
    setEditingSubmitting(true); setEditingError(null);
    try {
  await handleApi(()=>updateBoardColumn(board.id, col.id, updates, accessToken), { success: tBoard('columns.notifications.updated') });
      await refreshActiveBoard();
      setEditingColumnId(null);
      resetEditingFields();
  } catch(e){ setEditingError((e as Error).message); } finally { setEditingSubmitting(false); }
  };

  const handleMoveColumn = async (columnId:string, direction:-1|1) => {
    if(!accessToken || !board) return;
    const idx = board.columns.findIndex(c=>c.id===columnId); if(idx===-1) return;
    const pos = idx + direction; if(pos<0 || pos>=board.columns.length) return;
    try {
      await handleApi(()=>updateBoardColumn(board.id, columnId, { position: pos }, accessToken));
      await refreshActiveBoard();
    } catch { /* déjà géré */ }
  };

  const handleDeleteColumn = async (columnId:string) => {
    if(!accessToken || !board) return;
  const col = board.columns.find(c=>c.id===columnId); if(!col) return;
  const confirmationMessage = tBoard('columns.confirmDelete', { name: col.name });
  if(!window.confirm(confirmationMessage)) return;
    try {
  await handleApi(()=>deleteBoardColumn(board.id, columnId, accessToken), { success: tBoard('columns.notifications.deleted') });
      await refreshActiveBoard();
    } catch { /* toast déjà affiché */ }
  };

  const refreshArchivedNodesForColumn = useCallback(async (columnId: string) => {
    if (!board || !accessToken) return;
    if (archivedColumnIdRef.current !== columnId) return; // Seulement si cette colonne est en mode archived
    
    try {
      const items = await fetchArchivedNodes(board.id, columnId, accessToken);
      if (archivedColumnIdRef.current === columnId) {
        setArchivedNodes(items);
      }
    } catch (err) {
      console.error('Erreur rafraîchissement tâches archivées:', err);
    }
  }, [board, accessToken]);

  // Exposer la fonction de rafraichissement via un event custom
  useEffect(() => {
    const handleRefreshArchived = (event: CustomEvent<{ columnId: string }>) => {
      void refreshArchivedNodesForColumn(event.detail.columnId);
    };
    window.addEventListener('refreshArchivedNodes', handleRefreshArchived as EventListener);
    return () => {
      window.removeEventListener('refreshArchivedNodes', handleRefreshArchived as EventListener);
    };
  }, [refreshArchivedNodesForColumn]);

  const handleShowArchived = async (column: BoardColumnWithNodes) => {
    const currentMode = columnViewMode[column.id];
    if (currentMode === 'archived') {
      // Déjà en mode archived, revenir en normal
      setColumnViewMode((prev) => ({
        ...prev,
        [column.id]: null,
      }));
      closeArchivedDialog();
      return;
    }

    // Passer en mode archived
    setColumnViewMode((prev) => ({
      ...prev,
      [column.id]: 'archived',
    }));

    if (!board) {
      return;
    }
    setArchivedColumn({ id: column.id, name: column.name, behavior: column.behaviorKey });
    archivedColumnIdRef.current = column.id;
    setArchivedNodes([]);
    if (!accessToken) {
      toastError(tBoard('alerts.sessionInvalid'));
      setColumnViewMode((prev) => ({
        ...prev,
        [column.id]: null,
      }));
      closeArchivedDialog();
      return;
    }
    try {
      const items = await fetchArchivedNodes(board.id, column.id, accessToken);
      if (archivedColumnIdRef.current === column.id) {
        setArchivedNodes(items);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : tBoard('alerts.archivedLoadFailed');
      toastError(message);
      setColumnViewMode((prev) => ({
        ...prev,
        [column.id]: null,
      }));
      closeArchivedDialog();
    }
  };

  const handleShowSnoozed = (column: BoardColumnWithNodes) => {
    const currentMode = columnViewMode[column.id];
    setColumnViewMode((prev) => ({
      ...prev,
      [column.id]: currentMode === 'snoozed' ? null : 'snoozed',
    }));
  };

  const closeArchivedDialog = () => {
    setArchivedColumn(null);
    setArchivedNodes([]);
    archivedColumnIdRef.current = null;
  };

  const handleCreateCard = async (columnId:string, title:string) => {
    if(!accessToken || !board) throw new Error(tBoard('alerts.sessionInvalid'));
  await handleApi(()=>createNode({ title, columnId }, accessToken), { success: tBoard('cards.notifications.created') });
    await refreshActiveBoard();
  };

  const handleOpenCard = (id:string) => { open(id); };
  const handleRenameCard = async (id:string, newTitle:string) => {
    if(!accessToken) return; await handleApi(()=>updateNode(id,{ title: newTitle }, accessToken)); };

  const handleRequestMoveCard = (node: BoardNode) => {
    if (!board) {
      toastError(tBoard('alerts.boardUnavailable'));
      return;
    }
    setMoveTarget(node);
  };

  const handleRequestDeleteCard = (node: BoardNode) => {
    setDeleteTarget(node);
    setDeletePreview(null);
    setDeleteError(null);
    setDeleteSubmitting(null);
    setDeleteLoading(true);
    setDeleteShareSummary(null);
    setDeleteShareError(null);
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeletePreview(null);
    setDeleteError(null);
    setDeleteSubmitting(null);
    setDeleteLoading(false);
    setDeleteShareSummary(null);
    setDeleteShareError(null);
  };

  useEffect(() => {
    if (!deleteTarget || !deleteLoading || !accessToken) return;
    let cancelled = false;
    (async () => {
      const operations: Array<Promise<unknown>> = [
        fetchNodeDeletePreview(deleteTarget.id, accessToken),
      ];
      const shouldCheckShare = !deleteTarget.parentId;
      const shareIndex = shouldCheckShare
        ? operations.push(fetchNodeCollaborators(deleteTarget.id, accessToken)) - 1
        : null;
      const results = await Promise.allSettled(operations);
      if (cancelled) return;
      const previewResult = results[0];
      if (previewResult.status === 'fulfilled') {
        setDeletePreview(previewResult.value as NodeDeletePreview);
      } else {
        const reason = previewResult.reason;
        const message = reason instanceof Error && reason.message
          ? reason.message
          : tBoard('alerts.unexpectedError');
        setDeleteError(message);
      }
      if (shareIndex !== null) {
        const shareResult = results[shareIndex];
        if (shareResult.status === 'fulfilled') {
          setDeleteShareSummary(shareResult.value as NodeCollaboratorsResponse);
        } else {
          const reason = shareResult.reason;
          const message = reason instanceof Error && reason.message
            ? reason.message
            : tBoard('deleteDialog.shareLoadError');
          setDeleteShareError(message);
        }
      } else {
        setDeleteShareSummary(null);
        setDeleteShareError(null);
      }
      setDeleteLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteTarget, deleteLoading, accessToken, tBoard]);

  const externalCollaborators = useMemo<NodeCollaboratorsResponse['collaborators']>(() => {
    if (!deleteShareSummary) return [];
    return deleteShareSummary.collaborators.filter((collaborator) => {
      if (!collaborator.userId || collaborator.userId === user?.id) return false;
      return collaborator.accessType === 'DIRECT' || collaborator.accessType === 'INHERITED';
    });
  }, [deleteShareSummary, user?.id]);

  const pendingInvitations = useMemo<NodeCollaboratorsResponse['invitations']>(() => {
    if (!deleteShareSummary) return [];
    return deleteShareSummary.invitations.filter((invitation) => invitation.status === 'PENDING');
  }, [deleteShareSummary]);

  const shouldCheckShareGuard = Boolean(deleteTarget && !deleteTarget.parentId);

  const shareDeletionBlocked = useMemo(() => {
    if (!shouldCheckShareGuard) return false;
    return externalCollaborators.length > 0 || pendingInvitations.length > 0;
  }, [shouldCheckShareGuard, externalCollaborators, pendingInvitations]);

  const singleDeleteBlocked = shareDeletionBlocked || (deletePreview?.hasChildren ?? false);
  const singleDeleteDisabled = deleteLoading || deleteSubmitting !== null || singleDeleteBlocked;
  const recursiveDeleteDisabled = deleteLoading || deleteSubmitting !== null || shareDeletionBlocked;

  const confirmDelete = async (recursive: boolean) => {
    if (!deleteTarget || !accessToken) return;
    if (shareDeletionBlocked) {
      setDeleteError(tBoard('deleteDialog.shareBlockedTooltip'));
      return;
    }
    setDeleteSubmitting(recursive ? 'recursive' : 'single');
    setDeleteError(null);
    try {
      await apiDeleteNode(deleteTarget.id, { recursive }, accessToken);
  success(recursive ? tBoard('cards.notifications.deletedRecursive') : tBoard('cards.notifications.deleted'));
      closeDeleteDialog();
      await refreshActiveBoard();
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleteSubmitting(null);
    }
  };

  const togglePriority = (value: PriorityValue) => {
    setSelectedPriorities((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };

  const toggleEffort = (value: EffortFilterValue) => {
    setSelectedEfforts((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };

  const toggleDisplayOption = (key: keyof CardDisplayOptions) => {
    setDisplayOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const pillClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition ${
      active ? 'border-accent bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'
    }`;

  const displayTweaksActive = Object.values(displayOptions).some((value) => !value);
  const hasActiveFilters =
    selectedAssignees.length > 0 ||
    selectedPriorities.length > 0 ||
    selectedEfforts.length > 0 ||
    filterMine ||
    filterHasChildren ||
    parsedSearch.hasQuery ||
    sortPriority ||
    sortDueDate ||
    hideDone ||
    displayTweaksActive;

  const resetFilters = () => {
    setSelectedAssignees([]);
    setSelectedPriorities([]);
    setSelectedEfforts([]);
    setFilterMine(false);
    setFilterHasChildren(false);
    setSortPriority(false);
    setSortDueDate(false);
    setSearchDraft('');
    setSearchQuery('');
    setHideDone(false);
    setDisplayOptions({ ...CARD_DISPLAY_DEFAULTS });
  };

  // --- Drag & Drop (cartes) ---
  const onDragStart = (event:DragStartEvent) => {
    const { active } = event;
    if(!active){
      setDraggingCard(null);
      return;
    }
    const data = active.data.current as { columnId?: string; type?: string; node?: { id:string; title:string } } | undefined;
    if(data?.type === 'card' && data.node){
      setDraggingCard({ id: data.node.id, title: data.node.title });
    } else {
      setDraggingCard(null);
    }
  };

  const handleColumnDrop = async (activeColumnId: string, targetColumnId: string) => {
    if (!board || !accessToken) return;
    if (activeColumnId === targetColumnId) return;
    const base = optimisticColumns
      ? structuredClone(optimisticColumns) as BoardColumnWithNodes[]
      : structuredClone(board.columns) as BoardColumnWithNodes[];
    const fromIndex = base.findIndex((c) => c.id === activeColumnId);
    const toIndex = base.findIndex((c) => c.id === targetColumnId);
    if (fromIndex === -1 || toIndex === -1) return;
    const snapshot = structuredClone(base) as BoardColumnWithNodes[];
    const reordered = arrayMove(base, fromIndex, toIndex);
    setOptimisticColumns(reordered);
    try {
      await handleApi(() => updateBoardColumn(board.id, activeColumnId, { position: toIndex }, accessToken));
      await refreshActiveBoard();
      setOptimisticColumns(null);
    } catch {
      setOptimisticColumns(snapshot);
    }
  };

  const onDragEnd = async (event:DragEndEvent) => {
    const { active, over } = event;
    const activeType = (active?.data.current as { type?: string } | undefined)?.type;
    if (activeType === 'board-column') {
      setDraggingCard(null);
      if (!active || !over) return;
      const overType = (over.data.current as { type?: string } | undefined)?.type;
      const targetColumnId = overType === 'board-column' ? String(over.id) : null;
      if (targetColumnId) {
        await handleColumnDrop(String(active.id), targetColumnId);
      }
      return;
    }
    if(!accessToken || !board){
      setDraggingCard(null);
      return;
    }
    if(!active || !over){
      setDraggingCard(null);
      return;
    }
  const activeId = String(active.id);
  const overId = String(over.id);
    if(activeId === overId){
      setDraggingCard(null);
      return;
    }
    const activeColId = (active.data.current as { columnId?: string } | undefined)?.columnId;
    let overColId: string | undefined;
    
    // Determine source & target columns from effective snapshot
    const currentCols = effectiveColumns ? structuredClone(effectiveColumns) : structuredClone(board.columns) as BoardColumnWithNodes[];
    
    // Détermination robuste de la colonne cible
    const overData = over.data.current as { columnId?: string; type?: string } | undefined;
    if (overData?.columnId) {
      // Drop sur une carte -> utilise sa columnId
      overColId = overData.columnId;
    } else if (overData?.type === 'column-drop') {
      // Drop sur zone vide colonne -> over.id = column.id
      overColId = over.id as string;
    } else {
      // Fallback: over.id pourrait être directement un column.id
      const possibleCol = currentCols.find(c => c.id === overId);
      if (possibleCol) overColId = possibleCol.id;
    }
    
    if(!activeColId || !overColId){
      setDraggingCard(null);
      return;
    }
    
    const sourceCol = currentCols.find(c=>c.id===activeColId);
    const finalTargetCol = currentCols.find(c=>c.id===overColId);
    
    if (process.env.NODE_ENV !== 'production') {
      // Debug drag columns
      console.debug('[DnD] dragEnd', {
        movingCardId: activeId,
        activeColId,
        overRawId: overId,
        overData,
        derivedOverColId: overColId,
        sourceCol: sourceCol ? { id: sourceCol.id, name: sourceCol.name } : null,
        finalTargetCol: finalTargetCol ? { id: finalTargetCol.id, name: finalTargetCol.name } : null,
        allColumns: currentCols.map(c => ({ id: c.id, name: c.name, behaviorKey: c.behaviorKey })),
      });
    }
    if(!sourceCol || !finalTargetCol){
      setDraggingCard(null);
      return;
    }
    const sourceIndex = sourceCol.nodes?.findIndex(n=>n.id===activeId) ?? -1;
    if(sourceIndex === -1){
      setDraggingCard(null);
      return;
    }
    const moving = sourceCol.nodes![sourceIndex];
    const parentId = moving.parentId ?? board?.nodeId ?? null;
    if (!parentId) {
      setDraggingCard(null);
      return;
    }
    let targetIndex:number;
    if(sourceCol.id === finalTargetCol.id){
      // Reorder within same column
      const overIndex = finalTargetCol.nodes?.findIndex(n=>n.id===overId) ?? -1;
      targetIndex = overIndex === -1 ? (finalTargetCol.nodes!.length - 1) : overIndex;
      finalTargetCol.nodes = arrayMove(finalTargetCol.nodes || [], sourceIndex, targetIndex);
    } else {
      // Move across columns
      sourceCol.nodes = (sourceCol.nodes||[]).filter(n=>n.id!==moving.id);
      const overIndex = finalTargetCol.nodes?.findIndex(n=>n.id===overId) ?? -1;
      targetIndex = overIndex === -1 ? (finalTargetCol.nodes?.length ?? 0) : overIndex;
      const newArr = [...(finalTargetCol.nodes||[])];
      newArr.splice(targetIndex,0,moving);
      finalTargetCol.nodes = newArr;
    }
    const snapshot = optimisticColumns ? structuredClone(optimisticColumns) : structuredClone(board.columns) as BoardColumnWithNodes[];
    setOptimisticColumns(currentCols);
    try {
      // Si c'est une tâche mère partagée, utiliser l'endpoint de placement personnel
      if (moving.isSharedRoot) {
        await handleApi(() =>
          moveSharedNodePlacement(
            moving.id,
            { columnId: finalTargetCol.id, position: targetIndex },
            accessToken,
          ),
          { success: tBoard('cards.notifications.moved'), warnWip: tBoard('alerts.wipLimitReached') }
        );
      } else {
        // Sinon, utiliser le déplacement standard
        await handleApi(() =>
          moveChildNode(
            parentId,
            moving.id,
            { targetColumnId: finalTargetCol.id, position: targetIndex },
            accessToken,
          ),
          { success: tBoard('cards.notifications.moved'), warnWip: tBoard('alerts.wipLimitReached') }
        );
      }
      await refreshActiveBoard();
      setOptimisticColumns(null);
      // Inform listeners (e.g., TaskDrawer) that the node changed column
      try {
        window.dispatchEvent(new CustomEvent('nodeMoved', {
          detail: { nodeId: moving.id, targetColumnId: finalTargetCol.id },
        }));
      } catch { /* no-op */ }
    } catch {
      setOptimisticColumns(snapshot); // rollback
    }
    setDraggingCard(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-surface/90 backdrop-blur fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <Image src="/stratum.png" alt="Stratum" width={160} height={40} className="h-10 w-auto" priority />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              {t("common.actions.settings")}
            </Link>
            <button
              onClick={() => logout()}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              {t("common.actions.signOut")}
            </button>
          </div>
        </div>
      </header>
      <main className="flex flex-col gap-8 px-8 pt-8 pb-12 w-full">
        {(showBoardControls || isAddingColumn) && (
          <section className="grid gap-6">
            <div className="relative rounded-2xl border border-white/10 bg-card/70 p-6 w-full">
              {showBoardControls && (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[240px]">
                        <HelpTooltip
                          title={tBoard('help.search.title')}
                          description={tBoard('help.search.body')}
                          hint={tBoard('help.search.hint')}
                        >
                          <label className="flex flex-col gap-1 text-xs text-muted">
                            <span className="text-[10px] uppercase tracking-wide">{tBoard('search.label')}</span>
                            <input
                              type="search"
                              value={searchDraft}
                              onChange={(event) => setSearchDraft(event.target.value)}
                              onFocus={() => {
                                if (searchBlurTimeout.current !== null) window.clearTimeout(searchBlurTimeout.current);
                                setSearchFocused(true);
                              }}
                              onBlur={() => {
                                if (searchBlurTimeout.current !== null) window.clearTimeout(searchBlurTimeout.current);
                                searchBlurTimeout.current = window.setTimeout(() => setSearchFocused(false), 120);
                              }}
                              placeholder={tBoard('search.placeholder')}
                              className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                              aria-label={tBoard('search.aria')}
                            />
                            <span className="text-[10px] text-muted">{tBoard('search.helper')}</span>
                          </label>
                        </HelpTooltip>
                        {mentionContext && (
                          <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-white/10 bg-surface/95 shadow-2xl">
                            <ul className="max-h-56 overflow-y-auto py-2 text-sm">
                              {mentionSuggestions.length > 0 ? (
                                mentionSuggestions.map((assignee) => (
                                  <li key={assignee.id}>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        handleMentionSelect(assignee.displayName);
                                      }}
                                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-muted transition hover:bg-white/5 hover:text-foreground"
                                    >
                                      <span>{assignee.displayName}</span>
                                    </button>
                                  </li>
                                ))
                              ) : (
                                <li className="px-4 py-2 text-xs text-muted">{tBoard('search.mentions.empty')}</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <HelpTooltip
                          title={tBoard('help.quickFilters.mine.title')}
                          description={tBoard('help.quickFilters.mine.body')}
                        >
                          <button
                            type="button"
                            onClick={() => setFilterMine((prev) => !prev)}
                            className={pillClass(filterMine)}
                            aria-pressed={filterMine}
                          >
                            {tBoard('quickFilters.mine')}
                          </button>
                        </HelpTooltip>
                        <HelpTooltip
                          title={tBoard('help.quickFilters.priority.title')}
                          description={tBoard('help.quickFilters.priority.body')}
                        >
                          <button
                            type="button"
                            onClick={() => setSortPriority((prev) => !prev)}
                            className={pillClass(sortPriority)}
                            aria-pressed={sortPriority}
                          >
                            {tBoard('quickFilters.sortPriority')}
                          </button>
                        </HelpTooltip>
                        <HelpTooltip
                          title={tBoard('help.quickFilters.dueDate.title')}
                          description={tBoard('help.quickFilters.dueDate.body')}
                        >
                          <button
                            type="button"
                            onClick={() => setSortDueDate((prev) => !prev)}
                            className={pillClass(sortDueDate)}
                            aria-pressed={sortDueDate}
                          >
                            {tBoard('quickFilters.sortDueDate')}
                          </button>
                        </HelpTooltip>
                        <HelpTooltip
                          title={tBoard('help.quickFilters.expert.title')}
                          description={tBoard('help.quickFilters.expert.body')}
                          hint={tBoard('help.quickFilters.expert.hint')}
                        >
                          <button
                            type="button"
                            onClick={() => setExpertMode(!expertMode)}
                            className={pillClass(expertMode)}
                            aria-pressed={expertMode}
                            aria-label={expertMode ? tBoard('quickFilters.expert.ariaDisable') : tBoard('quickFilters.expert.ariaEnable')}
                            title={expertMode ? tBoard('quickFilters.expert.titleDisable') : tBoard('quickFilters.expert.titleEnable')}
                          >
                            {expertMode ? tBoard('quickFilters.expert.onLabel') : tBoard('quickFilters.expert.offLabel')}
                          </button>
                        </HelpTooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Bouton filtres avancés (seul dans la rangée pour éviter tout décalage) */}
                        <HelpTooltip
                          title={tBoard('help.filtersButton.title')}
                          description={tBoard('help.filtersButton.body')}
                          hint={tBoard('help.filtersButton.hint')}
                        >
                          <button
                              type="button"
                              onClick={() => setFiltersExpanded((prev) => !prev)}
                              className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${filtersExpanded ? 'border-accent bg-accent/10 text-foreground' : advancedFiltersActive ? 'border-accent/60 bg-accent/5 text-foreground' : 'border-white/15 bg-surface/70 text-muted hover:border-accent hover:text-foreground'}`}
                              aria-expanded={filtersExpanded}
                              aria-label={filtersExpanded ? tBoard('filters.button.ariaClose') : tBoard('filters.button.ariaOpen')}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M3.5 5A1.5 1.5 0 015 3.5h14A1.5 1.5 0 0120.5 5l-5.5 7v4.382a1.5 1.5 0 01-.83 1.342l-3 1.5A1.5 1.5 0 019 17.882V12L3.5 5z" />
                              </svg>
                              {advancedFiltersActive && !filtersExpanded && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
                            </button>
                        </HelpTooltip>
                      </div>
                    </div>
                  </div>
                  {/* Bouton Réinitialiser repositionné en bas à droite pour éviter tout shift visuel */}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="pointer-events-auto absolute bottom-3 right-4 rounded-full border border-white/15 px-4 py-1 text-[11px] font-semibold tracking-wide text-muted shadow-sm transition hover:border-accent hover:text-foreground hover:bg-accent/10"
                    >
                      {tBoard('filters.actions.reset')}
                    </button>
                  )}
                  {filtersExpanded && (
                    <AdvancedFiltersPanel
                      assigneeOptions={assigneeOptions}
                      selectedAssignees={selectedAssignees}
                      onAssigneesChange={setSelectedAssignees}
                      priorityOptions={priorityOptions}
                      selectedPriorities={selectedPriorities}
                      onTogglePriority={togglePriority}
                      effortOptions={EFFORT_OPTIONS}
                      selectedEfforts={selectedEfforts}
                      onToggleEffort={toggleEffort}
                      hideDone={hideDone}
                      onHideDoneChange={setHideDone}
                      filterHasChildren={filterHasChildren}
                      onFilterHasChildrenChange={setFilterHasChildren}
                      displayOptions={displayOptions}
                      onToggleDisplayOption={toggleDisplayOption}
                      onColumnHeightChange={(height) => setDisplayOptions(prev => ({ ...prev, columnHeight: height }))}
                      displayToggleConfig={DISPLAY_TOGGLE_CONFIG}
                      hasActiveFilters={hasActiveFilters}
                      onReset={resetFilters}
                      onClose={() => setFiltersExpanded(false)}
                      helpMode={helpMode}
                    />
                  )}
                </>
              )}
              {isAddingColumn && (
                <form onSubmit={handleSubmitColumn} className={`${showBoardControls ? 'mt-6' : ''} grid gap-4 md:grid-cols-2`}>
                  <HelpTooltip
                    helpMode={helpMode}
                    title={tBoard('help.columns.form.name.title')}
                    description={tBoard('help.columns.form.name.body')}
                    className="block"
                  >
                    <label className="text-xs text-muted">{tBoard('columns.form.name')}
                      <input value={columnName} onChange={e=>setColumnName(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" required />
                    </label>
                  </HelpTooltip>
                  <HelpTooltip
                    helpMode={helpMode}
                    title={tBoard('help.columns.form.behavior.title')}
                    description={tBoard('help.columns.form.behavior.body')}
                    hint={tBoard('help.columns.form.behavior.hint')}
                    className="block"
                  >
                    <label className="text-xs text-muted">{tBoard('columns.form.behavior')}
                      <select value={columnBehavior} onChange={e=>setColumnBehavior(e.target.value as 'BACKLOG'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CUSTOM')} className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent">
                        <option value="BACKLOG">{tBoard('behaviors.BACKLOG')}</option>
                        <option value="IN_PROGRESS">{tBoard('behaviors.IN_PROGRESS')}</option>
                        <option value="BLOCKED">{tBoard('behaviors.BLOCKED')}</option>
                        <option value="DONE">{tBoard('behaviors.DONE')}</option>
                        <option value="CUSTOM">{tBoard('behaviors.CUSTOM')}</option>
                      </select>
                    </label>
                  </HelpTooltip>
                  <HelpTooltip
                    helpMode={helpMode}
                    title={tBoard('help.columns.form.wip.title')}
                    description={tBoard('help.columns.form.wip.body')}
                    className="block"
                  >
                    <label className="text-xs text-muted">{tBoard('columns.form.wipLimit')}
                      <input type="number" min={1} value={columnWip} onChange={e=>setColumnWip(e.target.value)} placeholder={tBoard('columns.form.wipPlaceholder')} className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
                    </label>
                  </HelpTooltip>
                  <div className="flex items-center gap-3 pt-4">
                    <button disabled={columnSubmitting} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background disabled:opacity-60">{columnSubmitting ? tBoard('columns.form.creating') : tBoard('columns.form.create')}</button>
                    <button type="button" onClick={()=>{ setIsAddingColumn(false); resetColumnForm(); }} className="text-sm text-muted hover:text-foreground">{tBoard('columns.form.cancel')}</button>
                  </div>
                  {columnError && <p className="text-sm text-red-300 col-span-2">{columnError}</p>}
                </form>
              )}
            </div>
          </section>
        )}
        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-200">{error}</div>}
        {loading && <BoardSkeleton />}
        {!loading && board && (
          <section className="space-y-4 w-full">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{tBoard('columns.header.title')}</h2>
                <HelpTooltip
                  helpMode={helpMode}
                  title={tBoard('help.columns.add.title')}
                  description={tBoard('help.columns.add.body')}
                  hint={tBoard('help.columns.add.hint')}
                  className="inline-flex"
                >
                  <button type="button"
                    onClick={() => {
                      resetColumnForm();
                      setIsAddingColumn(true);
                      setFiltersExpanded(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-lg text-muted transition hover:border-accent hover:text-foreground"
                      title={tBoard('columns.header.addTooltip')}
                      aria-label={tBoard('columns.header.addTooltip')}
                  >
                    +
                  </button>
                </HelpTooltip>
                <button
                  type="button"
                  onClick={toggleHelpMode}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-lg transition group relative ${
                    helpMode
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-white/15 text-muted hover:border-accent hover:text-foreground'
                    }`}
                    title={helpMode ? tBoard('helpMode.tooltip.disableTitle') : tBoard('helpMode.tooltip.enableTitle')}
                    aria-label={helpMode ? tBoard('helpMode.tooltip.disableTitle') : tBoard('helpMode.tooltip.enableTitle')}
                  aria-pressed={helpMode}
                >
                  ?
                  <div
                    className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-72 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                    style={{ transitionDelay: '200ms' }}
                  >
                    <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                      <h4 className="mb-1 font-semibold text-accent">{tBoard('helpMode.tooltip.title')}</h4>
                      <p>{tBoard('helpMode.tooltip.body')}</p>
                      <p className="mt-2 text-[10px] text-slate-400">{tBoard('helpMode.tooltip.hint')}</p>
                  </div>
                </button>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted">
                  {detailLoading
                    ? tBoard('columns.header.status.refreshing')
                    : board.columns.length === 0
                      ? tBoard('columns.header.status.empty')
                      : board.columns.length === 1
                        ? tBoard('columns.header.status.single')
                        : tBoard('columns.header.status.multiple', { count: board.columns.length })}
              </span>
            </div>
            {displayedColumns && displayedColumns.length>0 ? (
              <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <ColumnList
                  columns={displayedColumns}
                  childBoards={childBoards}
                  editingColumnId={editingColumnId}
                  editingValues={{
                    name: editingName,
                    wip: editingWip,
                    backlogReviewAfter: editingBacklogReviewAfter,
                    backlogReviewEvery: editingBacklogReviewEvery,
                    backlogArchiveAfter: editingBacklogArchiveAfter,
                    doneArchiveAfter: editingDoneArchiveAfter,
                    submitting: editingSubmitting,
                    error: editingError,
                  }}
                  loadingCards={detailLoading}
                  displayOptions={displayOptions}
                  onRequestEdit={handleOpenColumnEditorById}
                  onCancelEdit={handleCancelEditColumn}
                  onSubmitEdit={handleUpdateColumn}
                  onFieldChange={(field,val)=>{
                    switch(field){
                      case 'name':
                        setEditingName(val);
                        break;
                      case 'wip':
                        setEditingWip(val);
                        break;
                      case 'backlogReviewAfter':
                        setEditingBacklogReviewAfter(val);
                        break;
                      case 'backlogReviewEvery':
                        setEditingBacklogReviewEvery(val);
                        break;
                      case 'backlogArchiveAfter':
                        setEditingBacklogArchiveAfter(val);
                        break;
                      case 'doneArchiveAfter':
                        setEditingDoneArchiveAfter(val);
                        break;
                      default:
                        break;
                    }
                  }}
                  onMoveColumn={handleMoveColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onCreateCard={handleCreateCard}
                  onOpenCard={handleOpenCard}
                  onOpenChildBoard={openChildBoard}
                  onRenameCard={handleRenameCard}
                  onRequestMoveCard={handleRequestMoveCard}
                  onRequestDeleteCard={handleRequestDeleteCard}
                  onShowArchived={handleShowArchived}
                  onShowSnoozed={handleShowSnoozed}
                  columnViewMode={columnViewMode}
                  archivedNodesByColumn={archivedColumn ? { [archivedColumn.id]: archivedNodes } : {}}
                  helpMode={helpMode}
                />
                <DragOverlay dropAnimation={null}>
                  {draggingCard && (
                    <div className="pointer-events-none w-64 rounded-xl border border-accent/40 bg-card/90 px-4 py-3 shadow-2xl backdrop-blur">
                      <p className="text-sm font-medium">{draggingCard.title}</p>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-card/60 p-8 text-center">
                <p className="text-sm text-muted">{tBoard('columns.emptyBoard')}</p>
              </div>
            )}
          </section>
        )}
      </main>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
            <h2 id="delete-dialog-title" className="text-lg font-semibold">{tBoard('deleteDialog.title', { title: deleteTarget.title })}</h2>
            <p className="mt-2 text-sm text-muted">
              {tBoard('deleteDialog.body')}
            </p>
            {deleteLoading && (
              <p className="mt-4 text-sm text-accent">{tBoard('deleteDialog.loading')}</p>
            )}
            {deletePreview && (
              <div className="mt-4 space-y-3 text-sm">
                <p>
                  <span className="font-semibold">{tBoard('deleteDialog.directChildren')}</span> {deletePreview.directChildren}
                </p>
                <p>
                  <span className="font-semibold">{tBoard('deleteDialog.totalDescendants')}</span> {deletePreview.totalDescendants}
                </p>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] font-mono text-muted">
                  <p className="sr-only">{tBoard('deleteDialog.legend')}</p>
                  <span className="text-amber-300">{deletePreview.counts.backlog}</span>
                  <span className="text-muted">.</span>
                  <span className="text-sky-300">{deletePreview.counts.inProgress}</span>
                  <span className="text-muted">.</span>
                  <span className="text-rose-300">{deletePreview.counts.blocked}</span>
                  <span className="text-muted">.</span>
                  <span className="text-emerald-300">{deletePreview.counts.done}</span>
                </div>
              </div>
            )}
            {deleteError && (
              <p className="mt-3 text-sm text-rose-300">{deleteError}</p>
            )}
            {shouldCheckShareGuard && deleteShareError && (
              <p className="mt-3 text-sm text-amber-300">{deleteShareError}</p>
            )}
            {shareDeletionBlocked && (
              <div className="mt-4 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-semibold">{tBoard('deleteDialog.shareBlockedTitle')}</p>
                <p className="mt-2">{tBoard('deleteDialog.shareBlockedBody')}</p>
                <ul className="mt-3 space-y-1 text-xs">
                  {externalCollaborators.length > 0 && (
                    <li>{tBoard('deleteDialog.shareBlockedCollaborators', { count: externalCollaborators.length })}</li>
                  )}
                  {pendingInvitations.length > 0 && (
                    <li>{tBoard('deleteDialog.shareBlockedInvitations', { count: pendingInvitations.length })}</li>
                  )}
                </ul>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-foreground"
              >
                {tBoard('deleteDialog.cancel')}
              </button>
              <button
                type="button"
                disabled={singleDeleteDisabled}
                title={shareDeletionBlocked ? tBoard('deleteDialog.shareBlockedTooltip') : (deletePreview?.hasChildren ? tBoard('deleteDialog.singleDisabledTooltip') : undefined)}
                onClick={() => confirmDelete(false)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${singleDeleteBlocked ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted' : 'border border-white/15 bg-white/5 text-foreground hover:border-accent'} ${deleteSubmitting === 'single' ? 'opacity-60' : ''}`}
              >
                {deleteSubmitting === 'single' ? tBoard('deleteDialog.deletingSingle') : tBoard('deleteDialog.deleteSingle')}
              </button>
              <button
                type="button"
                disabled={recursiveDeleteDisabled}
                title={shareDeletionBlocked ? tBoard('deleteDialog.shareBlockedTooltip') : undefined}
                onClick={() => confirmDelete(true)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${shareDeletionBlocked ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted' : 'border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:border-rose-200 hover:text-rose-100'} ${deleteSubmitting === 'recursive' ? 'opacity-60' : ''}`}
              >
                {deleteSubmitting === 'recursive' ? tBoard('deleteDialog.deletingRecursive') : tBoard('deleteDialog.deleteRecursive')}
              </button>
            </div>
          </div>
        </div>
      )}
      {moveTarget && board && teamId && (
        <MoveCardDialog
          teamId={teamId}
          node={moveTarget}
          currentBoardId={board.id}
          onClose={() => setMoveTarget(null)}
          onSuccess={async () => {
            try {
              await refreshActiveBoard();
            } catch (err) {
              const message = err instanceof Error && err.message ? err.message : tBoard('alerts.boardRefreshFailed');
              toastError(message);
            }
          }}
        />
      )}
    </div>
  );
}

export default TeamBoardPage;
