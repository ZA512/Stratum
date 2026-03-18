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

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function getEventToneStyle(eventType: string): React.CSSProperties {
  if (eventType.includes('COMMENT')) {
    return {
      borderColor: 'var(--color-success)',
      background: 'var(--color-success-soft)',
    };
  }
  if (eventType.includes('MOVED')) {
    return {
      borderColor: 'var(--color-info)',
      background: 'var(--color-info-soft)',
    };
  }
  if (eventType.includes('UPDATED')) {
    return {
      borderColor: 'var(--color-warning)',
      background: 'var(--color-warning-soft)',
    };
  }
  if (eventType.includes('ARCHIVED') || eventType.includes('DELETED')) {
    return {
      borderColor: 'var(--color-danger)',
      background: 'var(--color-danger-soft)',
    };
  }
  return {
    borderColor: 'var(--color-border-subtle)',
    background: 'color-mix(in srgb, var(--color-card) 88%, transparent)',
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
  }, [accessToken, boardId, deferredQuery, filters.eventType, filters.from, filters.to, t]);

  const groups = groupReportItems(report?.items ?? [], filters.groupBy);
  const isCompact = filters.density === 'compact';

  return (
    <div className={isCompact ? 'space-y-3' : 'space-y-4'}>
      <section className={`grid ${isCompact ? 'gap-2 md:grid-cols-4 xl:grid-cols-8' : 'gap-2.5 md:grid-cols-2 xl:grid-cols-4'}`}>
        <SummaryTile compact={isCompact} label={t('report.summary.totalEvents')} value={report?.summary.totalEvents ?? 0} tone="accent" />
        <SummaryTile compact={isCompact} label={t('report.summary.cardsCreated')} value={report?.summary.cardsCreated ?? 0} tone="success" />
        <SummaryTile compact={isCompact} label={t('report.summary.cardsMoved')} value={report?.summary.cardsMoved ?? 0} tone="info" />
        <SummaryTile compact={isCompact} label={t('report.summary.commentsAdded')} value={report?.summary.commentsAdded ?? 0} tone="warning" />
        <SummaryTile compact={isCompact} label={t('report.summary.descriptionsUpdated')} value={report?.summary.descriptionsUpdated ?? 0} tone="danger" />
        <SummaryTile compact={isCompact} label={t('report.summary.dueDatesUpdated')} value={report?.summary.dueDatesUpdated ?? 0} tone="info" />
        <SummaryTile compact={isCompact} label={t('report.summary.progressUpdated')} value={report?.summary.progressUpdated ?? 0} tone="success" />
        <SummaryTile compact={isCompact} label={t('report.summary.cardsArchived')} value={(report?.summary.cardsArchived ?? 0) + (report?.summary.cardsRestored ?? 0)} tone="neutral" />
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
                      {section.items.map((item) => (
                        <article key={item.id} className={`rounded-2xl border ${isCompact ? 'p-2.5' : 'p-3'}`} style={getEventToneStyle(item.eventType)}>
                          <div className={`flex flex-col ${isCompact ? 'gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto]' : 'gap-2.5 lg:flex-row lg:items-start lg:justify-between'}`}>
                            <div className={`min-w-0 ${isCompact ? 'space-y-1.5' : 'space-y-2'}`}>
                              <div className={`flex flex-wrap items-center text-[color:var(--color-foreground-subtle)] ${isCompact ? 'gap-1.5 text-[10px]' : 'gap-2 text-[11px]'}`}>
                                <span className={`rounded-full font-semibold text-foreground ${isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`} style={{ background: 'color-mix(in srgb, var(--color-background) 36%, transparent)' }}>{formatTimeLabel(item.createdAt)}</span>
                                <span>{item.actorDisplayName ?? t('report.labels.system')}</span>
                                <span className="text-[color:var(--color-foreground-faint)]">/</span>
                                <span>{item.eventType}</span>
                              </div>
                              <p className={isCompact ? 'text-[13px] font-medium leading-5 text-foreground' : 'text-sm font-medium text-foreground'}>{item.summary}</p>
                              <div className={`flex flex-wrap items-center text-[color:var(--color-foreground-subtle)] ${isCompact ? 'gap-1.5 text-[10px]' : 'gap-2 text-[11px]'}`}>
                                <span className={`rounded-full border ${isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`} style={{ borderColor: 'var(--color-border-subtle)' }}>#{item.nodeShortId ?? '...'}</span>
                                <span className="truncate">{item.nodeTitle}</span>
                                {item.columnName ? <span className={`rounded-full border ${isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`} style={{ borderColor: 'var(--color-border-subtle)' }}>{item.columnName}</span> : null}
                                {item.boardName !== boardName ? <span className={`rounded-full ${isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`} style={{ border: '1px solid var(--color-info)', background: 'var(--color-info-soft)', color: 'var(--color-foreground)' }}>{item.boardName}</span> : null}
                              </div>
                              {item.oldValue !== null || item.newValue !== null ? (
                                <div className={`rounded-xl border text-[color:var(--color-foreground-subtle)] ${isCompact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`} style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 16%, transparent)' }}>
                                  <span className="font-semibold text-foreground">{t('report.labels.before')}</span> {item.oldValue ?? t('report.labels.emptyValue')} <span className="mx-2 text-[color:var(--color-foreground-faint)]">→</span> <span className="font-semibold text-foreground">{t('report.labels.after')}</span> {item.newValue ?? t('report.labels.emptyValue')}
                                </div>
                              ) : null}
                              {item.commentPreview ? (
                                <div className={`overflow-y-auto rounded-xl border text-foreground whitespace-pre-wrap ${isCompact ? 'max-h-28 px-2.5 py-1.5 text-[13px] leading-5' : 'max-h-36 px-3 py-2 text-sm leading-6'}`} style={{ borderColor: 'var(--color-success)', background: 'var(--color-success-soft)' }}>
                                  {item.commentPreview}
                                </div>
                              ) : null}
                            </div>
                            <div className={`flex ${isCompact ? 'gap-1.5 lg:flex-col lg:items-end' : 'gap-2 lg:flex-col'}`}>
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
  compact = false,
  label,
  value,
  tone,
}: {
  compact?: boolean;
  label: string;
  value: number;
  tone: 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';
}) {
  return (
    <div className={`app-stat-tile rounded-2xl ${compact ? 'p-2.5' : 'p-3'}`} style={getSummaryToneStyle(tone)}>
      <p className={`uppercase tracking-[0.2em] text-[color:var(--color-foreground-faint)] ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{label}</p>
      <p className={`font-semibold text-foreground ${compact ? 'mt-1.5 text-xl md:text-[1.45rem]' : 'mt-2 text-2xl md:text-[1.8rem]'}`}>{value}</p>
    </div>
  );
}