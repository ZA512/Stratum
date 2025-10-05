"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import type { DashboardWidgetEntry } from "@/features/dashboards/dashboards-api";
import { useTranslation } from "@/i18n";
import { formatRelativeTime, parseDateString } from "@/features/dashboards/utils/date";
import {
  localizeWidgetField,
  type TranslateFn,
} from "@/features/dashboards/utils/widget-i18n";

const STATUS_STYLES: Record<
  DashboardWidgetEntry["status"],
  { badge: string; container: string }
> = {
  ok: {
    badge: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    container: "text-emerald-200",
  },
  "no-data": {
    badge: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    container: "text-amber-200",
  },
  "insufficient-coverage": {
    badge: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    container: "text-rose-200",
  },
  "insufficient-history": {
    badge: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    container: "text-amber-200",
  },
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  high: "border-rose-400/30 bg-rose-500/10 text-rose-100",
};

export interface DashboardWidgetCardProps {
  widget: DashboardWidgetEntry;
}

export function DashboardWidgetCard({ widget }: DashboardWidgetCardProps) {
  const { t } = useTranslation();
  const { label, description, status, reason, durationMs } = widget;
  const displayLabel = localizeWidgetField(t, widget, "label", label);
  const displayDescription = localizeWidgetField(
    t,
    widget,
    "description",
    description,
  );
  const statusStyle = STATUS_STYLES[status];
  const statusLabel = t(`dashboard.widget.status.${status}` as const);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-card/60 p-6 shadow-lg">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{displayLabel}</h2>
          <p className="text-xs text-muted">{displayDescription}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium uppercase tracking-wide ${statusStyle.badge}`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>
              {status === "ok" ? "check_circle" : status === "no-data" ? "info" : "warning"}
            </span>
            {statusLabel}
          </span>
          <span>{t("dashboard.widget.duration", { value: Math.round(durationMs) })}</span>
        </div>
      </header>
      <div className="min-h-[120px] rounded-xl bg-surface/60 p-4 text-sm text-foreground">
        {status !== "ok" ? (
          <WidgetStatusMessage status={status} reason={reason} t={t} />
        ) : (
          <WidgetPayloadRenderer widget={widget} t={t} />
        )}
      </div>
    </section>
  );
}

function WidgetStatusMessage({
  status,
  reason,
  t,
}: {
  status: DashboardWidgetEntry["status"];
  reason?: string;
  t: TranslateFn;
}) {
  const key = `dashboard.widget.status.${status}` as const;
  const emptyKey = `dashboard.widget.empty.${status}` as const;
  const emptyMessage = t(emptyKey);
  const fallback = emptyMessage === emptyKey ? t("dashboard.widget.empty.generic") : emptyMessage;
  const styles = STATUS_STYLES[status];
  return (
    <div className={`flex h-full flex-col items-start justify-center gap-3 text-sm ${styles.container}`}>
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${styles.badge}`}>
        <span className="material-symbols-outlined text-base" aria-hidden>
          {status === "no-data" ? "help" : "error"}
        </span>
        {t(key)}
      </div>
      <p className="text-xs text-muted">{reason || fallback}</p>
    </div>
  );
}

function WidgetPayloadRenderer({ widget, t }: { widget: DashboardWidgetEntry; t: TranslateFn }) {
  const { payload, id } = widget;

  if (id === "risk.healthScore") {
    return <HealthScoreWidget widget={widget} t={t} />;
  }

  if (payload == null) {
    return <p className="text-sm text-muted">{t("dashboard.widget.empty.noContent")}</p>;
  }
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return <p className="text-sm text-muted">{t("dashboard.widget.empty.list")}</p>;
    }
    if (payload.every((item) => typeof item === "object" && item !== null && "title" in item)) {
      return (
        <PaginatedList
          items={payload}
          render={(item, index) => (
            <li
              key={(item as { id?: string }).id ?? index}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <PayloadObjectPreview value={item as Record<string, unknown>} depth={1} t={t} />
            </li>
          )}
        />
      );
    }
    return (
      <PaginatedList
        as="ol"
        listClassName="list-decimal pl-5"
        items={payload}
        render={(value, index) => (
          <li key={index} className="text-sm text-foreground">
            <PayloadValue value={value} depth={1} t={t} />
          </li>
        )}
      />
    );
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return (
        <PaginatedList
          items={record.items}
          render={(item, index) => (
            <div
              key={(item as { id?: string }).id ?? index}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <PayloadObjectPreview value={item as Record<string, unknown>} depth={1} t={t} />
            </div>
          )}
          header={<PayloadKeyValues value={record} depth={0} omitKeys={["items"]} t={t} />}
        />
      );
    }
    return <PayloadObjectPreview value={record} depth={0} t={t} />;
  }

  return <PayloadValue value={payload} depth={0} t={t} />;
}

function PayloadObjectPreview({
  value,
  depth,
  t,
}: {
  value: Record<string, unknown>;
  depth: number;
  t: TranslateFn;
}) {
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return <p className="text-sm text-muted">{t("dashboard.widget.empty.noContent")}</p>;
  }
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {keys.map((key) => (
        <PayloadField key={key} name={key} value={value[key]} depth={depth + 1} t={t} />
      ))}
    </dl>
  );
}

function PayloadKeyValues({
  value,
  omitKeys = [],
  depth,
  t,
}: {
  value: Record<string, unknown>;
  omitKeys?: string[];
  depth: number;
  t: TranslateFn;
}) {
  const entries = Object.entries(value).filter(([key]) => !omitKeys.includes(key));
  if (!entries.length) return null;
  return (
    <dl className="grid gap-2 sm:grid-cols-3">
      {entries.map(([key, val]) => (
        <PayloadField key={key} name={key} value={val} depth={depth + 1} t={t} />
      ))}
    </dl>
  );
}

function PayloadValue({ value, depth, t }: { value: unknown; depth: number; t: TranslateFn }) {
  if (value == null) {
    return <span className="text-muted">{t("dashboard.widget.empty.noContent")}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">{t("dashboard.widget.empty.list")}</span>;
    if (typeof value[0] === "object" && value[0] !== null && depth < 3) {
      return (
        <PaginatedList
          items={value}
          dense
          render={(entry, index) => (
            <li key={index} className="rounded bg-white/5 px-2 py-1 text-xs">
              <PayloadValue value={entry} depth={depth + 1} t={t} />
            </li>
          )}
        />
      );
    }
    return <span>{value.join(", ")}</span>;
  }
  if (typeof value === "object") {
    if (value instanceof Date) {
      return <RelativeTime value={value} />;
    }
    const record = value as Record<string, unknown>;
    return <PayloadObjectPreview value={record} depth={depth + 1} t={t} />;
  }
  if (typeof value === "number") {
    return <span>{formatNumber(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span>{value ? "✔" : "✖"}</span>;
  }
  if (typeof value === "string") {
    const parsed = parseDateString(value);
    if (parsed) {
      return <RelativeTime value={parsed} original={value} />;
    }
  }
  return <span>{String(value)}</span>;
}

function PayloadField({
  name,
  value,
  depth,
  t,
}: {
  name: string;
  value: unknown;
  depth: number;
  t: TranslateFn;
}) {
  const label = formatKey(name);

  if (name === "severity" && typeof value === "string") {
    const style = SEVERITY_STYLES[value] ?? "border-white/10 bg-white/5 text-foreground";
    return (
      <div className="space-y-1">
        <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
        <dd>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold uppercase ${style}`}>
            <span className="material-symbols-outlined text-base" aria-hidden>
              {value === "high" ? "warning" : value === "medium" ? "priority" : "check_circle"}
            </span>
            {formatKey(value)}
          </span>
        </dd>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-foreground">
        <PayloadValue value={value} depth={depth} t={t} />
      </dd>
    </div>
  );
}

function formatKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function RelativeTime({ value, original }: { value: Date; original?: string }) {
  const { relative, absolute } = useMemo(() => formatRelativeTime(value), [value]);
  return (
    <time dateTime={original ?? value.toISOString()} title={absolute} aria-label={absolute}>
      {relative}
    </time>
  );
}

function PaginatedList<T>({
  items,
  render,
  header,
  dense = false,
  as,
  listClassName,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  header?: ReactNode;
  dense?: boolean;
  as?: "ol" | "ul";
  listClassName?: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = page * pageSize;
  const visible = items.slice(start, start + pageSize);

  const listClasses = [dense ? "space-y-1" : "space-y-3", listClassName]
    .filter(Boolean)
    .join(" ");
  const content = visible.map(render);

  return (
    <div className="space-y-4">
      {header}
      {as === "ol" ? (
        <ol className={listClasses}>{content}</ol>
      ) : (
        <ul className={listClasses}>{content}</ul>
      )}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 font-medium transition hover:border-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>
              arrow_back
            </span>
            {t("dashboard.pagination.previous")}
          </button>
          <span>
            {t("dashboard.pagination.page", { current: page + 1, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            disabled={page >= totalPages - 1}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 font-medium transition hover:border-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("dashboard.pagination.next")}
            <span className="material-symbols-outlined text-base" aria-hidden>
              arrow_forward
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function HealthScoreWidget({
  widget,
  t,
}: {
  widget: DashboardWidgetEntry;
  t: TranslateFn;
}) {
  const payload = widget.payload as {
    score?: number;
    breakdown?: Record<
      string,
      { ratio?: number; weight?: number; count?: number }
    >;
    totals?: { total?: number; withDue?: number; inProgress?: number };
  };

  const score = typeof payload?.score === "number" ? payload.score : null;
  const breakdown = payload?.breakdown ?? {};
  const totals = payload?.totals ?? {};
  const severity = score == null ? "medium" : score >= 80 ? "low" : score >= 60 ? "medium" : "high";
  const severityStyle =
    severity === "low"
      ? "bg-emerald-500/20"
      : severity === "medium"
      ? "bg-amber-500/20"
      : "bg-rose-500/20";

  const severityKey = score == null ? "unknown" : severity;
  const severityLabel = t(`dashboard.healthScore.severity.${severityKey}.label`);
  const severityAria =
    severityKey === "unknown"
      ? t("dashboard.healthScore.severity.unknown.aria")
      : t(`dashboard.healthScore.severity.${severityKey}.aria`);
  const badgeStyle =
    severityKey === "unknown"
      ? "border-white/10 bg-white/5 text-muted"
      : SEVERITY_STYLES[severity] ?? "border-white/10 bg-white/5 text-muted";
  const badgeIcon =
    severityKey === "high"
      ? "warning"
      : severityKey === "medium"
      ? "error"
      : severityKey === "low"
      ? "check_circle"
      : "help";

  const ariaLabel =
    score == null
      ? t("dashboard.healthScore.ariaUnknown")
      : t("dashboard.healthScore.ariaLabel", { score, severity: severityAria });

  const barColor =
    severity === "low"
      ? "bg-emerald-400"
      : severity === "medium"
      ? "bg-amber-400"
      : "bg-rose-400";

  const factors = [
    "overdue",
    "blocked",
    "stale",
    "missingDue",
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score ?? undefined}
        tabIndex={0}
        className={`relative overflow-hidden rounded-2xl border border-white/10 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${severityStyle}`}
      >
        <div className="text-xs uppercase tracking-wide text-muted">
          {t("dashboard.healthScore.title")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="text-5xl font-bold text-foreground">{score ?? "—"}</div>
          <span className="text-sm text-muted">
            {t("dashboard.healthScore.caption", { score: score ?? 0 })}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${badgeStyle}`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>
              {badgeIcon}
            </span>
            {severityLabel}
          </span>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          {t("dashboard.healthScore.totals", {
            total: totals.total ?? 0,
            withDue: totals.withDue ?? 0,
            inProgress: totals.inProgress ?? 0,
          })}
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("dashboard.healthScore.breakdownTitle")}
        </h3>
        <ul className="space-y-2">
          {factors.map((key) => {
            const data = breakdown[key] ?? {};
            const ratio = typeof data.ratio === "number" ? data.ratio : 0;
            const ratioPercent = Math.round(ratio * 100);
            const weight = data.weight ?? 0;
            const count = data.count ?? 0;
            return (
              <HealthBreakdownRow
                key={key}
                id={key}
                ratio={ratioPercent}
                weight={weight}
                count={count}
                t={t}
              />
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function HealthBreakdownRow({
  id,
  ratio,
  weight,
  count,
  t,
}: {
  id: "overdue" | "blocked" | "stale" | "missingDue";
  ratio: number;
  weight: number;
  count: number;
  t: TranslateFn;
}) {
  const tooltipId = useId();
  const ratioLabel = `${ratio}%`;
  const severity = ratio >= 50 ? "high" : ratio >= 25 ? "medium" : "low";
  const severityStyle = SEVERITY_STYLES[severity] ?? "border-white/10 bg-white/5 text-foreground";

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{t(`dashboard.healthScore.breakdown.${id}.label`)}</span>
          <span className="text-xs text-muted">
            {t(`dashboard.healthScore.breakdown.${id}.description`)}
          </span>
        </div>
        <div className="group relative inline-flex">
          <button
            type="button"
            aria-describedby={tooltipId}
            className="rounded-full border border-white/10 p-1 text-muted transition hover:border-accent/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>
              info
            </span>
          </button>
          <div
            role="tooltip"
            id={tooltipId}
            className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-white/10 bg-background/95 p-3 text-xs text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {t(`dashboard.healthScore.breakdown.${id}.tooltip`, { count, weight, ratio })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{t("dashboard.healthScore.ratio", { value: ratioLabel })}</span>
        <span>{t("dashboard.healthScore.weight", { value: weight })}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10">
        <div className={`h-full rounded-full ${severityStyle}`} style={{ width: `${Math.min(100, ratio)}%` }} />
      </div>
    </li>
  );
}
