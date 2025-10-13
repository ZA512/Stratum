"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskCard, { TaskCardProps, TaskAssignee } from '@/components/task/task-card';
import { useAuth } from '@/features/auth/auth-provider';
import { ensureChildBoard } from '@/features/boards/boards-api';
import type { BoardNode, ColumnBehaviorKey } from '@/features/boards/boards-api';
import type { CardDisplayOptions } from './types';
import { useTranslation } from '@/i18n';

interface BoardTaskCardProps {
  node: BoardNode;
  columnId: string;
  columnBehavior: ColumnBehaviorKey;
  childBoard?: { boardId: string } | undefined;
  onOpen: (id: string) => void;              // ouvre le drawer tâche
  onOpenChildBoard?: (boardId: string) => void; // navigation vers sous-board
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
  onRequestMove: (node: BoardNode) => void;
  onRequestDelete: (node: BoardNode) => void;
  displayOptions: CardDisplayOptions;
  helpMode?: boolean;
}

const DAY_IN_MS = 1000 * 60 * 60 * 24;

type CardHelpMessages = NonNullable<TaskCardProps['helpMessages']>;

function getInitials(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : parts[0]?.charAt(1) ?? '';
  return (first + last).toUpperCase();
}

function truncateDescription(description: string | null | undefined, maxLength = 110): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

export function BoardTaskCard({
  node,
  columnId,
  columnBehavior,
  childBoard,
  onOpen,
  onOpenChildBoard,
  onRename,
  onRequestMove,
  onRequestDelete,
  displayOptions,
  helpMode,
}: BoardTaskCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ 
    id: node.id, 
    data: { columnId, type: 'card', node: { id: node.id, title: node.title } }
  });
  const { accessToken } = useAuth();
  const { t: tBoard, locale } = useTranslation("board");
  
  const style: React.CSSProperties = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    opacity: isDragging ? 0.4 : 1 
  };

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fractalLoading, setFractalLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setTitle(node.title); }, [node.id, node.title]);

  const save = async () => {
    if (!editing) return;
    const t = title.trim();
    if (!t) { setTitle(node.title); setEditing(false); return; }
    if (t === node.title) { setEditing(false); return; }
    try {
      await onRename?.(node.id, t);
    } finally {
      setEditing(false);
    }
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen, closeMenu]);

  // Mapping vers TaskCard props
  const priority: TaskCardProps['priority'] = 
    node.priority === 'CRITICAL' ? 'Critical' :
    node.priority === 'HIGH' ? 'High' :
    node.priority === 'MEDIUM' ? 'Medium' :
    'Low';

  const responsibleMembers = node.raci?.responsible ?? node.assignees ?? [];
  const assignees: TaskAssignee[] = responsibleMembers.map(a => ({
    id: a.id,
    initials: getInitials(a.displayName),
    displayName: a.displayName,
  }));

  const raciDetails = useMemo(() => {
    const collect = (members?: { displayName: string }[] | null) => {
      return (members || [])
        .map((member) => member.displayName?.trim())
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    };

    if (!node.raci) {
      return {
        R: collect(node.assignees ?? []),
        A: [] as string[],
        C: [] as string[],
        I: [] as string[],
      };
    }

    return {
      R: collect(node.raci.responsible),
      A: collect(node.raci.accountable),
      C: collect(node.raci.consulted),
      I: collect(node.raci.informed),
    };
  }, [node.raci, node.assignees]);

  const raciTooltip = useMemo(() => {
    const lines = (['R', 'A', 'C', 'I'] as const).map((letter) => {
      const names = raciDetails[letter];
      return names.length ? `${letter} ${names.join(', ')}` : `${letter} -`;
    });

    const result = lines.join('\n');

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RACI tooltip]', {
        nodeId: node.id,
        hasRaci: !!node.raci,
        assigneesCount: node.assignees?.length || 0,
        tooltip: result,
        showOwner: displayOptions.showOwner,
      });
    }

    return result;
  }, [raciDetails, node.id, node.raci, node.assignees, displayOptions.showOwner]);

  const lateness = useMemo(() => {
    if (!node.dueAt) return undefined;
    const dueDate = new Date(node.dueAt);
    if (Number.isNaN(dueDate.getTime())) return undefined;
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    return Math.round((startDue.getTime() - startToday.getTime()) / DAY_IN_MS);
  }, [node.dueAt]);

  const complexity = node.effort === 'UNDER2MIN' ? 'XS' :
    node.effort === 'XS' ? 'XS' :
    node.effort === 'S' ? 'S' :
    node.effort === 'M' ? 'M' :
    node.effort === 'L' ? 'L' :
    node.effort === 'XL' ? 'XL' :
    node.effort === 'XXL' ? 'XXL' :
    undefined;

  const fractalPath = node.counts ? 
    `${node.counts.backlog}.${node.counts.inProgress}.${node.counts.blocked}.${node.counts.done}` :
    undefined;

  const shortIdLabel = typeof node.shortId === 'number' && Number.isFinite(node.shortId) && node.shortId > 0 ?
    node.shortId : node.id;

  const description = displayOptions.showDescription ? truncateDescription(node.description) : undefined;

  const showReminderBadge =
    columnBehavior === 'BLOCKED' &&
    typeof node.blockedReminderIntervalDays === 'number' &&
    Number.isFinite(node.blockedReminderIntervalDays) &&
    node.blockedReminderIntervalDays > 0;

  const reminderValue = showReminderBadge
    ? typeof node.blockedReminderDueInDays === 'number' && Number.isFinite(node.blockedReminderDueInDays)
      ? Math.max(0, node.blockedReminderDueInDays)
      : node.blockedReminderIntervalDays ?? null
    : null;

  const reminderTooltip = useMemo(() => {
    if (!showReminderBadge) return undefined;
    if (typeof node.blockedReminderDueInDays === 'number' && Number.isFinite(node.blockedReminderDueInDays)) {
      if (node.blockedReminderDueInDays <= 0) {
        return tBoard('cards.reminder.today');
      }
      return tBoard('cards.reminder.dueIn', { count: node.blockedReminderDueInDays });
    }
    if (typeof node.blockedReminderIntervalDays === 'number') {
      return tBoard('cards.reminder.every', { count: node.blockedReminderIntervalDays });
    }
    return undefined;
  }, [showReminderBadge, node.blockedReminderDueInDays, node.blockedReminderIntervalDays, tBoard]);

  const helpMessages = useMemo<CardHelpMessages>(() => {
    const messages: CardHelpMessages = {};

    const raciOrder = ['R', 'A', 'C', 'I'] as const;
    const raciEntries = raciOrder.map(role => ({
      role,
      names: raciDetails[role],
    }));
    const raciLines = raciEntries.map(entry => {
      if (entry.names.length > 0) {
        return tBoard("help.cards.assignees.infoLine", {
          role: entry.role,
          names: entry.names.join(", "),
        });
      }
      return tBoard("help.cards.assignees.infoLineEmpty", { role: entry.role });
    });
    const raciInfoDescription = raciEntries.some(entry => entry.names.length > 0)
      ? raciLines.join("\n")
      : [tBoard("help.cards.assignees.infoEmpty"), raciLines.join("\n")].join("\n");

    const dueDateInfoDescription = (() => {
      if (!node.dueAt) return undefined;
      const dueDate = new Date(node.dueAt);
      if (Number.isNaN(dueDate.getTime())) return undefined;

      const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
      const formattedDate = formatter.format(dueDate);

      let remainingDays: number;
      if (typeof lateness === 'number' && Number.isFinite(lateness)) {
        remainingDays = lateness;
      } else {
        const today = new Date();
        const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        remainingDays = Math.round((startDue.getTime() - startToday.getTime()) / DAY_IN_MS);
      }

      const abs = Math.abs(remainingDays);
      const plural = abs > 1 ? 's' : '';

      let relative: string;
      if (remainingDays === 0) {
        relative = locale === 'fr' ? "aujourd'hui" : 'today';
      } else if (remainingDays > 0) {
        relative = locale === 'fr'
          ? `dans ${abs} jour${plural}`
          : `in ${abs} day${plural}`;
      } else {
        relative = locale === 'fr'
          ? `en retard de ${abs} jour${plural}`
          : `${abs} day${plural} late`;
      }

      return tBoard("help.cards.dueDate.info", {
        date: formattedDate,
        relative,
      });
    })();

    const fractalCounts = node.counts;
    const fractalInfoDescription = fractalCounts
      ? tBoard("help.cards.fractal.info", {
          backlog: fractalCounts.backlog ?? 0,
          inProgress: fractalCounts.inProgress ?? 0,
          blocked: fractalCounts.blocked ?? 0,
          done: fractalCounts.done ?? 0,
        })
      : undefined;

    messages.id = {
      help: {
        title: tBoard("help.cards.id.title"),
        description: tBoard("help.cards.id.body"),
      },
    };

    messages.priority = {
      help: {
        title: tBoard("help.cards.priority.title"),
        description: tBoard("help.cards.priority.body"),
      },
    };

    messages.menu = {
      help: {
        title: tBoard("help.cards.menu.title"),
        description: tBoard("help.cards.menu.body"),
        hint: tBoard("help.cards.menu.hint"),
      },
      align: "right",
    };

    messages.assignees = {
      help: {
        title: tBoard("help.cards.assignees.title"),
        description: tBoard("help.cards.assignees.body"),
        hint: tBoard("help.cards.assignees.hint"),
      },
      info: {
        title: tBoard("help.cards.assignees.title"),
        description: raciInfoDescription,
      },
    };

    if (node.dueAt) {
      messages.dueDate = {
        help: {
          title: tBoard("help.cards.dueDate.title"),
          description: tBoard("help.cards.dueDate.body"),
          hint: tBoard("help.cards.dueDate.hint"),
        },
        info: {
          title: tBoard("help.cards.dueDate.title"),
          description: dueDateInfoDescription,
        },
      };
    }

    if (displayOptions.showProgress) {
      messages.progress = {
        help: {
          title: tBoard("help.cards.progress.title"),
          description: tBoard("help.cards.progress.body"),
        },
        align: "right",
      };
    }

    if (node.effort) {
      messages.effort = {
        help: {
          title: tBoard("help.cards.effort.title"),
          description: tBoard("help.cards.effort.body"),
        },
        align: "right",
      };
    }

    if (fractalPath) {
      messages.fractal = {
        help: {
          title: tBoard("help.cards.fractal.title"),
          description: tBoard("help.cards.fractal.body"),
          hint: childBoard
            ? tBoard("help.cards.fractal.hintExisting")
            : tBoard("help.cards.fractal.hintCreate"),
        },
        info: {
          title: tBoard("help.cards.fractal.title"),
          description: fractalInfoDescription,
        },
        align: "right",
      };
    }

    return messages;
  }, [tBoard, locale, raciDetails, node.dueAt, node.effort, node.counts?.backlog, node.counts?.inProgress, node.counts?.blocked, node.counts?.done, displayOptions.showProgress, fractalPath, childBoard, lateness]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative"
    >
      <TaskCard
        id={shortIdLabel}
        priority={priority}
        title={editing ? '' : title}
        description={description}
        assignees={assignees}
        assigneeTooltip={raciTooltip}
        lateness={lateness}
        complexity={complexity}
        fractalPath={fractalPath}
        progress={typeof node.progress === 'number' ? node.progress : undefined}
        showId={displayOptions.showShortId}
        showPriority={displayOptions.showPriority}
        showAssignees={displayOptions.showOwner}
        showDueDate={displayOptions.showDueDate}
        showProgress={displayOptions.showProgress}
        showEffort={displayOptions.showEffort}
        helpMode={helpMode}
        helpMessages={helpMessages}
        onClick={() => onOpen(node.id)}
        onFractalPathClick={async () => {
          if (!onOpenChildBoard || fractalLoading) return;
            // Si déjà présent
          if (childBoard) {
            onOpenChildBoard(childBoard.boardId);
            return;
          }
          if (!accessToken) return;
          try {
            setFractalLoading(true);
            const boardId = await ensureChildBoard(node.id, accessToken);
            onOpenChildBoard(boardId);
          } catch {
            // TODO: brancher un toast d'erreur si disponible
          } finally {
            setFractalLoading(false);
          }
        }}
        onMenuButtonClick={() => setMenuOpen(prev => !prev)}
        className="cursor-grab active:cursor-grabbing"
      />
      {(node as unknown as { isSnoozed?: boolean }).isSnoozed && (
        <div
          className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-full bg-cyan-400/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-900 shadow"
          title={tBoard('cards.snoozedBadge')}
          aria-label={tBoard('cards.snoozedAria')}
        >
          <span className="material-symbols-outlined text-[14px] leading-none">snooze</span>
        </div>
      )}
      {showReminderBadge && reminderValue !== null && (
        <div
          className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1 text-[11px] font-semibold text-slate-900 shadow"
          title={reminderTooltip}
          aria-label={reminderTooltip}
        >
          <span className="material-symbols-outlined text-[16px] leading-none">schedule</span>
          <span className="leading-none">{reminderValue}</span>
        </div>
      )}
      {fractalLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 z-40">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        </div>
      )}
      
      {/* Menu contextuel overlay */}
      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-2 top-12 min-w-[180px] rounded-xl border border-white/10 bg-surface/95 p-2 text-sm shadow-xl backdrop-blur z-50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onOpen(node.id);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10 focus:bg-white/10"
          >
            ✏️ <span>{tBoard('cards.menu.open')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              setEditing(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10 focus:bg-white/10"
          >
            📝 <span>{tBoard('cards.menu.rename')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onRequestMove(node);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10 focus:bg-white/10"
          >
            📦 <span>{tBoard('cards.menu.move')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onRequestDelete(node);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-300 transition hover:bg-rose-500/20 focus:bg-rose-500/20"
          >
            🗑️ <span>{tBoard('cards.menu.delete')}</span>
          </button>
        </div>
      )}
      
      {/* Mode édition overlay */}
      {editing && (
        <div className="absolute inset-4 flex items-start">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={e => { 
              if (e.key === 'Enter') { save(); } 
              if (e.key === 'Escape') { setTitle(node.title); setEditing(false); } 
            }}
            className="w-full rounded border border-blue-500 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-blue-500/40"
            autoFocus
          />
        </div>
      )}
      
      {/* Bouton menu customisé retiré : on utilise celui du TaskCard via delegation */}
    </div>
  );
}