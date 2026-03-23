"use client";

import React, { useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import {
  fetchBoardActivityReport,
  type BoardActivityReport,
  type BoardActivityReportItem,
} from '@/features/activity/activity-api';
import { useTranslation } from '@/i18n';

export type ReportGroupBy = 'project' | 'timeline' | 'type';
export type ReportDensity = 'comfortable' | 'compact';
export type ReportScope = 'subtree' | 'board';
export type ReportPreset =
  | '24h'
  | '7d'
  | '14d'
  | '21d'
  | '28d'
  | 'current-week'
  | 'previous-week'
  | 'current-month'
  | 'previous-month'
  | 'custom';

export type ReportViewFilters = {
  preset: ReportPreset;
  from: string;
  to: string;
  groupBy: ReportGroupBy;
  eventType: string;
  density: ReportDensity;
  scope: ReportScope;
};

type BoardReportViewProps = {
  boardId: string;
  boardName: string;
  query?: string;
  filters: ReportViewFilters;
  onOpenTask: (nodeId: string) => void;
  onOpenBoard: (boardId: string) => void;
};

export const createDefaultReportFilters = (): ReportViewFilters => {
  const range = getPresetRange('7d');
  return {
    preset: '7d',
    from: range.from,
    to: range.to,
    groupBy: 'project',
    eventType: 'ALL',
    density: 'compact',
    scope: 'subtree',
  };
};

export const REPORT_EVENT_TYPE_OPTIONS = [
  'ALL',
  'NODE_CREATED',
  'NODE_MOVED',
  'MOVED_TO_BOARD',
  'COMMENT_ADDED',
  'COMMENT_EDITED',
  'COMMENT_DELETED',
  'DESCRIPTION_UPDATED',
  'TITLE_UPDATED',
  'DUE_DATE_UPDATED',
  'PROGRESS_UPDATED',
  'PRIORITY_UPDATED',
  'EFFORT_UPDATED',
  'NODE_ARCHIVED',
  'NODE_RESTORED',
  'ESTIMATED_TIME_UPDATED',
  'PLANNED_START_DATE_UPDATED',
  'PLANNED_END_DATE_UPDATED',
  'ACTUAL_END_DATE_UPDATED',
  'SCHEDULE_MODE_CHANGED',
  'BILLING_STATUS_UPDATED',
  'PLANNED_BUDGET_UPDATED',
  'CONSUMED_BUDGET_UPDATED',
  'BACKLOG_HIDDEN_UNTIL_UPDATED',
  'BACKLOG_REVIEW_RESTARTED',
 ] as const;

type ReportTone = 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

type ReportClause = {
  tone: ReportTone;
  actionKey: string;
  subjectKey: string;
  value?: string | null;
  from?: string | null;
  to?: string | null;
  fallback?: string | null;
};

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getToneVariable(tone: ReportTone): string {
  if (tone === 'success') return 'var(--color-success)';
  if (tone === 'info') return 'var(--color-info)';
  if (tone === 'warning') return 'var(--color-warning)';
  if (tone === 'danger') return 'var(--color-danger)';
  if (tone === 'accent') return 'var(--color-accent)';
  return 'var(--color-border-strong)';
}

function getEventTone(eventType: string): ReportTone {
  if (eventType.includes('COMMENT')) return 'success';
  if (eventType.includes('MOVED')) return 'info';
  if (eventType.includes('CREATED') || eventType.includes('RESTORED')) return 'accent';
  if (eventType.includes('UPDATED')) return 'warning';
  if (eventType.includes('ARCHIVED') || eventType.includes('DELETED')) return 'danger';
  return 'neutral';
}

function formatReportValue(
  value: string | null | undefined,
  fieldKey: string | null,
  eventType: string,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (fieldKey === 'progress' || eventType === 'PROGRESS_UPDATED') {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return `${numeric}%`;
    }
  }

  if (fieldKey?.includes('date') || fieldKey?.includes('At') || eventType.includes('DATE') || /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T00:00:00.000Z`
      : trimmed;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  }

  return trimmed;
}

function getSubjectKey(item: BoardActivityReportItem): string {
  switch (item.eventType) {
    case 'NODE_CREATED':
    case 'NODE_ARCHIVED':
    case 'NODE_RESTORED':
      return 'card';
    case 'COMMENT_ADDED':
    case 'COMMENT_EDITED':
    case 'COMMENT_DELETED':
      return 'comment';
    case 'DESCRIPTION_UPDATED':
      return 'description';
    case 'TITLE_UPDATED':
      return 'title';
    case 'DUE_DATE_UPDATED':
      return 'dueDate';
    case 'PROGRESS_UPDATED':
      return 'progress';
    case 'PRIORITY_UPDATED':
      return 'priority';
    case 'EFFORT_UPDATED':
      return 'effort';
    case 'NODE_MOVED':
    case 'KANBAN_MOVED':
      return 'column';
    case 'MOVED_TO_BOARD':
      return 'board';
    default:
      if (item.fieldKey === 'plannedStartDate') return 'plannedStart';
      if (item.fieldKey === 'plannedEndDate') return 'plannedEnd';
      if (item.fieldKey === 'actualEndDate') return 'actualEnd';
      if (item.fieldKey === 'scheduleMode') return 'scheduleMode';
      if (item.fieldKey === 'plannedBudget') return 'plannedBudget';
      if (item.fieldKey === 'consumedBudget') return 'consumedBudget';
      if (item.fieldKey === 'backlogHiddenUntil') return 'backlogHiddenUntil';
      if (item.fieldKey === 'assignees') return 'assignees';
      if (item.fieldKey === 'tags') return 'tags';
      return 'details';
  }
}

function getActionKey(item: BoardActivityReportItem): string {
  if (item.eventType.endsWith('_CREATED')) return 'creation';
  if (item.eventType.endsWith('_ADDED')) return 'add';
  if (item.eventType.endsWith('_DELETED') || item.eventType.includes('ARCHIVED')) return 'delete';
  if (item.eventType.includes('RESTORED')) return 'restore';
  if (item.eventType.includes('MOVED')) return 'move';
  return 'change';
}

function buildReportClause(item: BoardActivityReportItem): ReportClause {
  const tone = getEventTone(item.eventType);
  const actionKey = getActionKey(item);
  const subjectKey = getSubjectKey(item);
  const from = formatReportValue(item.oldValue, item.fieldKey, item.eventType);
  const to = formatReportValue(item.newValue, item.fieldKey, item.eventType);
  const comment = formatReportValue(item.commentPreview ?? item.commentBody, item.fieldKey, item.eventType);

  if (item.eventType === 'NODE_CREATED') {
    return { tone, actionKey: 'creation', subjectKey: 'card', value: item.nodeTitle };
  }

  if (item.eventType === 'COMMENT_ADDED' || item.eventType === 'COMMENT_EDITED' || item.eventType === 'COMMENT_DELETED') {
    return {
      tone,
      actionKey,
      subjectKey: 'comment',
      value: comment,
      fallback: item.summary,
    };
  }

  if (item.eventType === 'MOVED_TO_BOARD') {
    return {
      tone,
      actionKey: 'move',
      subjectKey: 'board',
      from,
      to: to ?? item.boardName,
      fallback: item.summary,
    };
  }

  if (item.eventType === 'NODE_MOVED' || item.eventType === 'KANBAN_MOVED') {
    return {
      tone,
      actionKey: 'move',
      subjectKey: 'column',
      from,
      to,
      fallback: item.summary,
    };
  }

  if (from !== null || to !== null) {
    return {
      tone,
      actionKey: from === null ? 'add' : actionKey,
      subjectKey,
      from,
      to,
      fallback: item.summary,
    };
  }

  return {
    tone,
    actionKey,
    subjectKey,
    value: comment ?? formatReportValue(item.nodeTitle, item.fieldKey, item.eventType),
    fallback: item.summary,
  };
}

export function getPresetRange(preset: ReportPreset): { from: string; to: string } {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  if (preset === '24h') {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { from: formatDateInput(start), to: formatDateInput(end) };
  }

  if (preset === '7d') start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  if (preset === '14d') start = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
  if (preset === '21d') start = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
  if (preset === '28d') start = new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000);

  if (preset === 'current-week') {
    const day = (now.getUTCDay() + 6) % 7;
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  }

  if (preset === 'previous-week') {
    const day = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    start = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    end.setTime(weekStart.getTime() - 24 * 60 * 60 * 1000);
  }

  if (preset === 'current-month') {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  if (preset === 'previous-month') {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    end.setTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  }

  return { from: formatDateInput(start), to: formatDateInput(end) };
}

function groupReportItems(items: BoardActivityReportItem[], groupBy: ReportGroupBy) {
  if (groupBy === 'timeline') {
    const map = new Map<string, BoardActivityReportItem[]>();
    for (const item of items) {
      const dayKey = item.createdAt.slice(0, 10);
      const bucket = map.get(dayKey) ?? [];
      bucket.push(item);
      map.set(dayKey, bucket);
    }
    return Array.from(map.entries()).map(([key, entries]) => ({
      key,
      label: formatDayLabel(key),
      sections: [{ key, label: formatDayLabel(key), items: entries }],
    }));
  }

  if (groupBy === 'type') {
    const map = new Map<string, BoardActivityReportItem[]>();
    for (const item of items) {
      const bucket = map.get(item.eventType) ?? [];
      bucket.push(item);
      map.set(item.eventType, bucket);
    }
    return Array.from(map.entries()).map(([key, entries]) => ({
      key,
      label: key,
      sections: buildDaySections(entries),
    }));
  }

  const map = new Map<string, BoardActivityReportItem[]>();
  for (const item of items) {
    const bucket = map.get(item.boardId) ?? [];
    bucket.push(item);
    map.set(item.boardId, bucket);
  }
  return Array.from(map.entries()).map(([key, entries]) => ({
    key,
    label: entries[0]?.boardName ?? key,
    sections: buildDaySections(entries),
  }));
}

function buildDaySections(items: BoardActivityReportItem[]) {
  const dayMap = new Map<string, BoardActivityReportItem[]>();
  for (const item of items) {
    const dayKey = item.createdAt.slice(0, 10);
    const bucket = dayMap.get(dayKey) ?? [];
    bucket.push(item);
    dayMap.set(dayKey, bucket);
  }
  return Array.from(dayMap.entries()).map(([key, entries]) => ({
    key,
    label: formatDayLabel(key),
    items: entries,
  }));
}

function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTimeLabel(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEventCardStyle(eventType: string): React.CSSProperties {
  const variable = getToneVariable(getEventTone(eventType));
  return {
    borderColor: `color-mix(in srgb, ${variable} 28%, var(--color-border) 72%)`,
    background: `linear-gradient(135deg, color-mix(in srgb, ${variable} 6%, var(--color-card) 94%), color-mix(in srgb, var(--color-surface) 92%, transparent))`,
    boxShadow: `inset 3px 0 0 ${variable}`,
  };
}

function getSummaryToneStyle(
  tone: 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral',
): React.CSSProperties {
  const variable =
    tone === 'accent'
      ? 'var(--color-accent)'
      : tone === 'success'
        ? 'var(--color-success)'
        : tone === 'info'
          ? 'var(--color-info)'
          : tone === 'warning'
            ? 'var(--color-warning)'
            : tone === 'danger'
              ? 'var(--color-danger)'
              : 'var(--color-border-strong)';

  return {
    borderColor: `color-mix(in srgb, ${variable} 34%, var(--color-border) 66%)`,
    background: `linear-gradient(135deg, color-mix(in srgb, ${variable} 18%, var(--color-card) 82%), color-mix(in srgb, ${variable} 6%, var(--color-surface) 94%))`,
  };
}

export function BoardReportView({
  boardId,
  boardName,
  query = '',
  filters,
  onOpenTask,
  onOpenBoard,
}: BoardReportViewProps) {
  const { accessToken } = useAuth();
  const { t } = useTranslation('board');
  const [report, setReport] = useState<BoardActivityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchBoardActivityReport(boardId, accessToken, {
      from: filters.from,
      to: filters.to,
      query: deferredQuery.trim() || undefined,
      eventTypes: filters.eventType === 'ALL' ? undefined : [filters.eventType],
      limit: 500,
      scope: filters.scope,
    })
      .then((data) => {
        if (!cancelled) {
          setReport(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message || t('report.states.error'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, boardId, deferredQuery, filters.eventType, filters.from, filters.scope, filters.to, t]);

  const groups = groupReportItems(report?.items ?? [], filters.groupBy);
  const isCompact = filters.density === 'compact';

  return (
    <div className={isCompact ? 'space-y-3' : 'space-y-4'}>
      <section className={`grid ${isCompact ? 'gap-2 md:grid-cols-4 xl:grid-cols-8' : 'gap-2.5 md:grid-cols-2 xl:grid-cols-4'}`}>
        <SummaryTile density={filters.density} label={t('report.summary.totalEvents')} value={report?.summary.totalEvents ?? 0} tone="accent" />
        <SummaryTile density={filters.density} label={t('report.summary.cardsCreated')} value={report?.summary.cardsCreated ?? 0} tone="success" />
        <SummaryTile density={filters.density} label={t('report.summary.cardsMoved')} value={report?.summary.cardsMoved ?? 0} tone="info" />
        <SummaryTile density={filters.density} label={t('report.summary.commentsAdded')} value={report?.summary.commentsAdded ?? 0} tone="warning" />
        <SummaryTile density={filters.density} label={t('report.summary.descriptionsUpdated')} value={report?.summary.descriptionsUpdated ?? 0} tone="danger" />
        <SummaryTile density={filters.density} label={t('report.summary.dueDatesUpdated')} value={report?.summary.dueDatesUpdated ?? 0} tone="info" />
        <SummaryTile density={filters.density} label={t('report.summary.progressUpdated')} value={report?.summary.progressUpdated ?? 0} tone="success" />
        <SummaryTile density={filters.density} label={t('report.summary.cardsArchived')} value={(report?.summary.cardsArchived ?? 0) + (report?.summary.cardsRestored ?? 0)} tone="neutral" />
      </section>

      {loading ? (
        <div className={`app-panel rounded-3xl ${isCompact ? 'p-4 text-[13px]' : 'p-6 text-sm'} text-[color:var(--color-foreground-subtle)]`}>
          {t('report.states.loading')}
        </div>
      ) : error ? (
        <div className={`rounded-3xl border ${isCompact ? 'p-4 text-[13px]' : 'p-6 text-sm'} text-foreground`} style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}>
          {error}
        </div>
      ) : groups.length === 0 ? (
        <div className={`app-panel rounded-3xl border-dashed ${isCompact ? 'p-4 text-[13px]' : 'p-6 text-sm'} text-[color:var(--color-foreground-subtle)]`}>
          {t('report.states.empty')}
        </div>
      ) : (
        <div className={isCompact ? 'space-y-3' : 'space-y-4'}>
          {groups.map((group) => (
            <section key={group.key} className={`app-panel rounded-3xl ${isCompact ? 'p-3' : 'p-3.5 md:p-4'}`}>
              <div className={`flex items-center justify-between gap-3 border-b ${isCompact ? 'mb-2 pb-2' : 'mb-3 pb-3'}`} style={{ borderColor: 'var(--color-border-subtle)' }}>
                <h3 className={isCompact ? 'text-[15px] font-semibold text-foreground' : 'text-base font-semibold text-foreground md:text-lg'}>{group.label}</h3>
                <span className={`app-pill rounded-full ${isCompact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]'}`}>
                  {group.sections.reduce((count, section) => count + section.items.length, 0)} {t('report.units.events')}
                </span>
              </div>
              <div className={isCompact ? 'space-y-3' : 'space-y-4'}>
                {group.sections.map((section) => (
                  <div key={section.key} className={isCompact ? 'space-y-2' : 'space-y-2.5'}>
                    <h4 className={`font-semibold uppercase tracking-[0.22em] text-[color:var(--color-foreground-faint)] ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>{section.label}</h4>
                    <div className={isCompact ? 'space-y-2' : 'space-y-2.5'}>
                      {section.items.map((item) => {
                        const clause = buildReportClause(item);
                        const detailsText = clause.value ?? clause.fallback ?? item.summary;
                        return (
                        <article key={item.id} className={`rounded-2xl border ${isCompact ? 'p-2.5' : 'p-3'}`} style={getEventCardStyle(item.eventType)}>
                          <div className={`flex flex-col ${isCompact ? 'gap-1.5' : 'gap-2.5 lg:flex-row lg:items-start lg:justify-between'}`}>
                            <div className={`min-w-0 ${isCompact ? 'space-y-1.5' : 'space-y-2'}`}>
                              {isCompact ? (
                                <>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                                      <span className="font-semibold text-foreground">{formatTimeLabel(item.createdAt)}</span>
                                      <span className="text-[color:var(--color-foreground-faint)]">•</span>
                                      <span className="text-[color:var(--color-foreground-subtle)]">{item.actorDisplayName ?? t('report.labels.system')}</span>
                                      <span className="text-[color:var(--color-foreground-faint)]">•</span>
                                      <span className="rounded-md border px-1.5 py-0.5 font-semibold text-foreground" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 18%, transparent)' }}>#{item.nodeShortId ?? '...'}</span>
                                      <span className="truncate text-[12px] font-semibold text-foreground">{item.nodeTitle}</span>
                                      {item.columnName ? <span className="text-[color:var(--color-foreground-subtle)]">{item.columnName}</span> : null}
                                      {item.boardName !== boardName ? <span className="rounded-md px-1.5 py-0.5 text-[10px] text-foreground" style={{ border: '1px solid var(--color-info)', background: 'var(--color-info-soft)' }}>{item.boardName}</span> : null}
                                    </div>
                                    <div className="flex shrink-0 gap-1.5">
                                      {item.boardId !== boardId ? (
                                        <button
                                          type="button"
                                          onClick={() => onOpenBoard(item.boardId)}
                                          className="app-pill rounded-full px-2.5 py-1 text-[10px] font-semibold transition hover:border-[color:var(--color-accent)] hover:text-foreground"
                                        >
                                          {t('report.actions.openBoard')}
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (item.boardId !== boardId) {
                                            onOpenBoard(item.boardId);
                                            return;
                                          }
                                          onOpenTask(item.nodeId);
                                        }}
                                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition"
                                        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-foreground)' }}
                                      >
                                        {item.boardId !== boardId ? t('report.actions.openContext') : t('report.actions.openTask')}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    <KeywordChip density={filters.density} tone={clause.tone} label={t(`report.keywords.${clause.actionKey}` as const)} />
                                    <KeywordChip density={filters.density} tone="neutral" label={t(`report.keywords.${clause.subjectKey}` as const)} />
                                    {clause.from ? <ValueToken density={filters.density} value={clause.from} /> : null}
                                    {clause.from && clause.to ? <KeywordChip density={filters.density} tone="neutral" label={t('report.keywords.to')} /> : null}
                                    {clause.to ? <ValueToken density={filters.density} value={clause.to} /> : null}
                                    {!clause.from && !clause.to && detailsText ? <ValueToken density={filters.density} value={detailsText} /> : null}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--color-foreground-subtle)]">
                                    <span className="rounded-full px-2 py-1 font-semibold text-foreground" style={{ background: 'color-mix(in srgb, var(--color-background) 36%, transparent)' }}>{formatTimeLabel(item.createdAt)}</span>
                                    <span>{item.actorDisplayName ?? t('report.labels.system')}</span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className="rounded-full border px-2 py-1 font-semibold text-foreground" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 24%, transparent)' }}>#{item.nodeShortId ?? '...'}</span>
                                    <span className="min-w-0 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold text-foreground" style={{ background: 'color-mix(in srgb, var(--color-background) 28%, transparent)' }}>{item.nodeTitle}</span>
                                    {item.columnName ? <span className="rounded-full border px-2 py-1 text-[11px] text-[color:var(--color-foreground-subtle)]" style={{ borderColor: 'var(--color-border-subtle)' }}>{item.columnName}</span> : null}
                                    {item.boardName !== boardName ? <span className="rounded-full px-2 py-1 text-[11px] text-foreground" style={{ border: '1px solid var(--color-info)', background: 'var(--color-info-soft)' }}>{item.boardName}</span> : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <KeywordChip density={filters.density} tone={clause.tone} label={t(`report.keywords.${clause.actionKey}` as const)} />
                                    <KeywordChip density={filters.density} tone="neutral" label={t(`report.keywords.${clause.subjectKey}` as const)} />
                                    {clause.from ? <ValueToken density={filters.density} value={clause.from} /> : null}
                                    {clause.from && clause.to ? <KeywordChip density={filters.density} tone="neutral" label={t('report.keywords.to')} /> : null}
                                    {clause.to ? <ValueToken density={filters.density} value={clause.to} /> : null}
                                    {!clause.from && !clause.to && detailsText ? <ValueToken density={filters.density} value={detailsText} multiline /> : null}
                                  </div>
                                  {clause.fallback && clause.fallback !== detailsText ? (
                                    <p className="text-[11px] leading-5 text-[color:var(--color-foreground-subtle)]">
                                      {clause.fallback}
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </div>
                            <div className={`flex ${isCompact ? 'hidden' : 'gap-2 lg:flex-col'}`}>
                              {item.boardId !== boardId ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenBoard(item.boardId)}
                                  className={`app-pill rounded-full font-semibold transition hover:border-[color:var(--color-accent)] hover:text-foreground ${isCompact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}
                                >
                                  {t('report.actions.openBoard')}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.boardId !== boardId) {
                                    onOpenBoard(item.boardId);
                                    return;
                                  }
                                  onOpenTask(item.nodeId);
                                }}
                                className={`rounded-full font-semibold transition ${isCompact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}
                                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-foreground)' }}
                              >
                                {item.boardId !== boardId ? t('report.actions.openContext') : t('report.actions.openTask')}
                              </button>
                            </div>
                          </div>
                        </article>
                      )})}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  density = 'compact',
  label,
  value,
  tone,
}: {
  density?: ReportDensity;
  label: string;
  value: number;
  tone: 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';
}) {
  const compact = density === 'compact';
  return (
    <div className={`app-stat-tile rounded-2xl ${compact ? 'p-2.5' : 'p-3'}`} style={getSummaryToneStyle(tone)}>
      <p className={`uppercase tracking-[0.2em] text-[color:var(--color-foreground-faint)] ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{label}</p>
      <p className={`font-semibold text-foreground ${compact ? 'mt-1.5 text-xl md:text-[1.45rem]' : 'mt-2 text-2xl md:text-[1.8rem]'}`}>{value}</p>
    </div>
  );
}

function KeywordChip({
  density,
  tone,
  label,
}: {
  density: ReportDensity;
  tone: ReportTone;
  label: string;
}) {
  const compact = density === 'compact';
  const variable = getToneVariable(tone);
  return (
    <span
      className={`font-semibold uppercase tracking-[0.08em] ${compact ? 'rounded-[6px] px-1.5 py-[3px] text-[9px]' : 'rounded-[8px] px-2 py-1 text-[10px]'}`}
      style={{
        border: `1px solid color-mix(in srgb, ${variable} 35%, transparent)`,
        background: `color-mix(in srgb, ${variable} 18%, var(--color-background) 82%)`,
        color: 'var(--color-foreground)',
      }}
    >
      {label}
    </span>
  );
}

function ValueToken({
  density,
  value,
  multiline = false,
}: {
  density: ReportDensity;
  value: string;
  multiline?: boolean;
}) {
  const compact = density === 'compact';
  return (
    <strong className={`font-semibold text-foreground ${multiline ? 'whitespace-pre-wrap break-words' : ''} ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
      "{value}"
    </strong>
  );
}