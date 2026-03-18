"use client";

import React, { useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import {
  fetchBoardActivityReport,
  type BoardActivityReport,
  type BoardActivityReportItem,
} from '@/features/activity/activity-api';
import { useTranslation } from '@/i18n';

type ReportGroupBy = 'project' | 'timeline' | 'type';
type ReportPreset =
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

type BoardReportViewProps = {
  boardId: string;
  boardName: string;
  onOpenTask: (nodeId: string) => void;
  onOpenBoard: (boardId: string) => void;
};

type ReportFilters = {
  preset: ReportPreset;
  from: string;
  to: string;
  groupBy: ReportGroupBy;
  query: string;
  eventType: string;
};

const DEFAULT_FILTERS = (): ReportFilters => {
  const range = getPresetRange('7d');
  return {
    preset: '7d',
    from: range.from,
    to: range.to,
    groupBy: 'project',
    query: '',
    eventType: 'ALL',
  };
};

const EVENT_TYPE_OPTIONS = [
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
];

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPresetRange(preset: ReportPreset): { from: string; to: string } {
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

function getEventTone(eventType: string): string {
  if (eventType.includes('COMMENT')) return 'border-emerald-400/25 bg-emerald-500/10';
  if (eventType.includes('MOVED')) return 'border-sky-400/25 bg-sky-500/10';
  if (eventType.includes('UPDATED')) return 'border-amber-400/25 bg-amber-500/10';
  if (eventType.includes('ARCHIVED') || eventType.includes('DELETED')) return 'border-rose-400/25 bg-rose-500/10';
  return 'border-white/10 bg-card/70';
}

export function BoardReportView({
  boardId,
  boardName,
  onOpenTask,
  onOpenBoard,
}: BoardReportViewProps) {
  const { accessToken } = useAuth();
  const { t } = useTranslation('board');
  const storageKey = `stratum:board:${boardId}:report-filters:v1`;
  const [filters, setFilters] = useState<ReportFilters>(() => DEFAULT_FILTERS());
  const [hydrated, setHydrated] = useState(false);
  const [report, setReport] = useState<BoardActivityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ReportFilters>;
        setFilters({ ...DEFAULT_FILTERS(), ...parsed });
      } else {
        setFilters(DEFAULT_FILTERS());
      }
    } catch {
      setFilters(DEFAULT_FILTERS());
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, hydrated, storageKey]);

  useEffect(() => {
    if (!accessToken || !hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchBoardActivityReport(boardId, accessToken, {
      from: filters.from,
      to: filters.to,
      query: deferredQuery.trim() || undefined,
      eventTypes: filters.eventType === 'ALL' ? undefined : [filters.eventType],
      limit: 500,
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
  }, [accessToken, boardId, deferredQuery, filters.eventType, filters.from, filters.to, hydrated, t]);

  const groups = groupReportItems(report?.items ?? [], filters.groupBy);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(244,114,36,0.18),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-200/70">
              {t('report.eyebrow')}
            </p>
            <h2 className="font-serif text-3xl text-white">{t('report.title', { boardName })}</h2>
            <p className="max-w-2xl text-sm text-slate-300">{t('report.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['24h', '7d', '14d', '21d', '28d', 'current-week', 'previous-week', 'current-month', 'previous-month'] as ReportPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  const range = getPresetRange(preset);
                  setFilters((current) => ({ ...current, preset, from: range.from, to: range.to }));
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filters.preset === preset
                    ? 'border-orange-300 bg-orange-300 text-slate-950'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:border-orange-300/40 hover:text-white'
                }`}
              >
                {t(`report.presets.${preset}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <label className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <span>{t('report.filters.search')}</span>
            <input
              type="text"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder={t('report.filters.searchPlaceholder')}
              className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-orange-300"
            />
          </label>
          <label className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <span>{t('report.filters.from')}</span>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, preset: 'custom', from: event.target.value }))}
              className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-orange-300 [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <span>{t('report.filters.to')}</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, preset: 'custom', to: event.target.value }))}
              className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-orange-300 [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <span>{t('report.filters.eventType')}</span>
            <select
              value={filters.eventType}
              onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))}
              className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-orange-300"
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? t('report.filters.allEvents') : option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(['project', 'timeline', 'type'] as ReportGroupBy[]).map((groupBy) => (
            <button
              key={groupBy}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, groupBy }))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filters.groupBy === groupBy
                  ? 'border-sky-300 bg-sky-300 text-slate-950'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:border-sky-300/40 hover:text-white'
              }`}
            >
              {t(`report.groupBy.${groupBy}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label={t('report.summary.totalEvents')} value={report?.summary.totalEvents ?? 0} accent="orange" />
        <SummaryTile label={t('report.summary.cardsCreated')} value={report?.summary.cardsCreated ?? 0} accent="emerald" />
        <SummaryTile label={t('report.summary.cardsMoved')} value={report?.summary.cardsMoved ?? 0} accent="sky" />
        <SummaryTile label={t('report.summary.commentsAdded')} value={report?.summary.commentsAdded ?? 0} accent="amber" />
        <SummaryTile label={t('report.summary.descriptionsUpdated')} value={report?.summary.descriptionsUpdated ?? 0} accent="rose" />
        <SummaryTile label={t('report.summary.dueDatesUpdated')} value={report?.summary.dueDatesUpdated ?? 0} accent="violet" />
        <SummaryTile label={t('report.summary.progressUpdated')} value={report?.summary.progressUpdated ?? 0} accent="cyan" />
        <SummaryTile label={t('report.summary.cardsArchived')} value={(report?.summary.cardsArchived ?? 0) + (report?.summary.cardsRestored ?? 0)} accent="slate" />
      </section>

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-card/70 p-8 text-sm text-slate-300">
          {t('report.states.loading')}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-8 text-sm text-rose-100">
          {error}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-card/60 p-8 text-sm text-slate-300">
          {t('report.states.empty')}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="rounded-3xl border border-white/10 bg-card/60 p-4">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <h3 className="text-lg font-semibold text-white">{group.label}</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  {group.sections.reduce((count, section) => count + section.items.length, 0)} {t('report.units.events')}
                </span>
              </div>
              <div className="space-y-5">
                {group.sections.map((section) => (
                  <div key={section.key} className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{section.label}</h4>
                    <div className="space-y-3">
                      {section.items.map((item) => (
                        <article key={item.id} className={`rounded-2xl border p-4 ${getEventTone(item.eventType)}`}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                                <span className="rounded-full bg-black/25 px-2 py-1 font-semibold text-white">{formatTimeLabel(item.createdAt)}</span>
                                <span>{item.actorDisplayName ?? t('report.labels.system')}</span>
                                <span className="text-slate-500">/</span>
                                <span>{item.eventType}</span>
                              </div>
                              <p className="text-sm font-medium text-white">{item.summary}</p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                                <span className="rounded-full border border-white/10 px-2 py-1">#{item.nodeShortId ?? '...'}</span>
                                <span className="truncate">{item.nodeTitle}</span>
                                {item.columnName ? <span className="rounded-full border border-white/10 px-2 py-1">{item.columnName}</span> : null}
                                {item.boardName !== boardName ? <span className="rounded-full border border-sky-300/30 bg-sky-500/10 px-2 py-1 text-sky-100">{item.boardName}</span> : null}
                              </div>
                              {item.oldValue !== null || item.newValue !== null ? (
                                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                                  <span className="font-semibold text-slate-100">{t('report.labels.before')}</span> {item.oldValue ?? t('report.labels.emptyValue')} <span className="mx-2 text-slate-500">→</span> <span className="font-semibold text-slate-100">{t('report.labels.after')}</span> {item.newValue ?? t('report.labels.emptyValue')}
                                </div>
                              ) : null}
                              {item.commentPreview ? (
                                <div className="max-h-40 overflow-y-auto rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-sm leading-6 text-emerald-50 whitespace-pre-wrap">
                                  {item.commentPreview}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex gap-2 lg:flex-col">
                              {item.boardId !== boardId ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenBoard(item.boardId)}
                                  className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-300 hover:text-white"
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
                                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-200"
                              >
                                {item.boardId !== boardId ? t('report.actions.openContext') : t('report.actions.openTask')}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
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
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'orange' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'cyan' | 'slate';
}) {
  const accents: Record<string, string> = {
    orange: 'from-orange-500/20 to-orange-500/5 text-orange-100',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-100',
    sky: 'from-sky-500/20 to-sky-500/5 text-sky-100',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-100',
    rose: 'from-rose-500/20 to-rose-500/5 text-rose-100',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-100',
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-100',
    slate: 'from-slate-500/20 to-slate-500/5 text-slate-100',
  };

  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br p-4 ${accents[accent]}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-current/70">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}