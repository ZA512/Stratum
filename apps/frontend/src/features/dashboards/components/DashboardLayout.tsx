"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import type { DashboardMode, DashboardKind } from "@/features/dashboards/dashboards-api";
import { useTranslation } from "@/i18n";
import { formatRelativeTime, parseDateString } from "@/features/dashboards/utils/date";

const NAV_ITEMS: Array<{ dashboard: DashboardKind; href: string; translationKey: string }> = [
  { dashboard: "EXECUTION", href: "/dashboards/execution", translationKey: "dashboard.nav.execution" },
  { dashboard: "PROGRESS", href: "/dashboards/progress", translationKey: "dashboard.nav.progress" },
  { dashboard: "RISK", href: "/dashboards/risk", translationKey: "dashboard.nav.risk" },
];

export interface DashboardLayoutProps {
  dashboard: DashboardKind;
  title: string;
  description: string;
  mode: DashboardMode;
  supportedModes: DashboardMode[];
  onModeChange: (mode: DashboardMode) => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  hiddenWidgetsCount?: number;
  onHiddenWidgetsClick?: () => void;
  generatedAt?: string;
  datasetRefreshedAt?: string | null;
  metadataSummary?: React.ReactNode;
}

export function DashboardLayout({
  dashboard,
  title,
  description,
  mode,
  supportedModes,
  onModeChange,
  actions,
  hiddenWidgetsCount = 0,
  onHiddenWidgetsClick,
  generatedAt,
  datasetRefreshedAt,
  metadataSummary,
  children,
}: DashboardLayoutProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const supportsAggregated = supportedModes.includes("AGGREGATED");
  const supportsComparison = supportedModes.includes("COMPARISON");
  const lastNonComparisonModeRef = useRef<DashboardMode>(mode === "COMPARISON" ? "SELF" : mode);

  if (mode !== "COMPARISON") {
    lastNonComparisonModeRef.current = mode;
  }

  const includeDescendants = mode === "AGGREGATED";
  const comparisonActive = mode === "COMPARISON";

  const formattedGeneratedAt = useMemo(() => {
    if (!generatedAt) return null;
    try {
      const date = parseDateString(generatedAt);
      if (!date) return null;
      const { relative, absolute } = formatRelativeTime(date);
      return { relative, absolute, iso: date.toISOString() };
    } catch {
      return null;
    }
  }, [generatedAt]);

  const formattedDatasetRefreshedAt = useMemo(() => {
    if (!datasetRefreshedAt) return null;
    try {
      const date = parseDateString(datasetRefreshedAt);
      if (!date) return null;
      const { relative, absolute } = formatRelativeTime(date);
      return { relative, absolute, iso: date.toISOString() };
    } catch {
      return null;
    }
  }, [datasetRefreshedAt]);

  const handleAggregatedToggle = () => {
    if (!supportsAggregated) return;
    if (comparisonActive) return;
    onModeChange(includeDescendants ? "SELF" : "AGGREGATED");
  };

  const handleComparisonToggle = () => {
    if (!supportsComparison) return;
    if (comparisonActive) {
      const fallback = lastNonComparisonModeRef.current ?? "SELF";
      onModeChange(fallback === "COMPARISON" ? "SELF" : fallback);
      return;
    }
    onModeChange("COMPARISON");
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header className="app-panel-strong flex flex-col gap-4 rounded-[28px] p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted md:items-end">
            {formattedGeneratedAt ? (
              <span className="flex items-center gap-2">
                <span>{t("dashboard.generatedAtLabel")}</span>
                <time
                  dateTime={formattedGeneratedAt.iso}
                  title={formattedGeneratedAt.absolute}
                  aria-label={formattedGeneratedAt.absolute}
                  className="app-badge rounded-full px-2 py-1 text-xs font-medium text-foreground"
                >
                  {formattedGeneratedAt.relative}
                </time>
              </span>
            ) : null}
            {formattedDatasetRefreshedAt ? (
              <span className="flex items-center gap-2">
                <span>{t("dashboard.datasetRefreshedLabel")}</span>
                <time
                  dateTime={formattedDatasetRefreshedAt.iso}
                  title={formattedDatasetRefreshedAt.absolute}
                  aria-label={formattedDatasetRefreshedAt.absolute}
                  className="app-badge rounded-full px-2 py-1 text-xs font-medium text-foreground"
                >
                  {formattedDatasetRefreshedAt.relative}
                </time>
              </span>
            ) : null}
            {metadataSummary}
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = dashboard === item.dashboard || pathname === item.href;
            return (
              <Link
                key={item.dashboard}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isActive
                    ? "app-segment-active"
                    : "app-pill hover:border-[color:var(--color-accent)] hover:text-foreground"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {t(item.translationKey)}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("dashboard.modes.selfLabel")}
              </span>
              <span className="app-badge rounded-full px-2 py-1 text-xs text-foreground">
                {t(`dashboard.modeLabels.${mode.toLowerCase() as "self" | "aggregated" | "comparison"}`)}
              </span>
            </div>
            {supportsAggregated ? (
              <button
                type="button"
                role="switch"
                aria-checked={includeDescendants}
                onClick={handleAggregatedToggle}
                disabled={comparisonActive}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  includeDescendants
                    ? "app-pill-active"
                    : "app-pill hover:border-[color:var(--color-accent)] hover:text-foreground"
                } ${comparisonActive ? "opacity-60" : ""}`}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>
                  device_hub
                </span>
                {t("dashboard.modes.includeDescendants")}
              </button>
            ) : null}
            {supportsComparison ? (
              <button
                type="button"
                role="switch"
                aria-checked={comparisonActive}
                onClick={handleComparisonToggle}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  comparisonActive
                    ? "app-pill-active"
                    : "app-pill hover:border-[color:var(--color-accent)] hover:text-foreground"
                }`}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>
                  data_object
                </span>
                {t("dashboard.modes.compareChildren")}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {onHiddenWidgetsClick ? (
              <button
                type="button"
                onClick={onHiddenWidgetsClick}
                className="app-pill flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition hover:border-[color:var(--color-accent)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="material-symbols-outlined text-base" aria-hidden>
                  visibility_off
                </span>
                {t("dashboard.hiddenWidgets.button", { count: hiddenWidgetsCount })}
              </button>
            ) : null}
            {actions}
          </div>
        </div>
      </header>
      <main className="flex flex-col gap-5 pb-10">
        {children}
      </main>
    </div>
  );
}
