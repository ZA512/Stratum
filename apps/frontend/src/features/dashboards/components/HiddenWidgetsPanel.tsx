"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DashboardWidgetEntry } from "@/features/dashboards/dashboards-api";
import { useTranslation } from "@/i18n";
import { localizeWidgetField } from "@/features/dashboards/utils/widget-i18n";

const STATUS_STYLES: Record<DashboardWidgetEntry["status"], string> = {
  ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  "no-data": "border-amber-400/40 bg-amber-500/10 text-amber-200",
  "insufficient-coverage": "border-rose-400/40 bg-rose-500/10 text-rose-200",
  "insufficient-history": "border-amber-400/40 bg-amber-500/10 text-amber-200",
};

export interface HiddenWidgetsPanelProps {
  open: boolean;
  onClose: () => void;
  widgets: DashboardWidgetEntry[];
}

export function HiddenWidgetsPanel({ open, onClose, widgets }: HiddenWidgetsPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const focusableSelector = useMemo(
    () =>
      [
        "a[href]",
        "button:not([disabled])",
        "textarea",
        "input[type!='hidden']",
        "select",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    [],
  );

  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusableSelector, onClose, open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm" role="presentation">
      <div
        ref={panelRef}
        className="flex h-full max-h-full w-full max-w-md flex-col gap-4 overflow-hidden border-l border-white/10 bg-surface p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hidden-widgets-title"
      >
        <header className="flex items-start justify-between">
          <div>
            <h2 id="hidden-widgets-title" className="text-lg font-semibold text-foreground">
              {t("dashboard.hiddenWidgets.title")}
            </h2>
            <p className="text-sm text-muted">{t("dashboard.hiddenWidgets.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            ref={closeRef}
            className="rounded-full border border-white/10 p-2 text-muted transition hover:border-accent/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={t("dashboard.hiddenWidgets.close")}
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto pr-1">
          {widgets.length === 0 ? (
            <p className="text-sm text-muted">{t("dashboard.hiddenWidgets.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {widgets.map((widget) => (
                <li key={widget.id} className="rounded-xl border border-white/10 bg-card/60 p-4">
                  <div className="flex flex-col gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {localizeWidgetField(t, widget, "label", widget.label)}
                      </h3>
                      <p className="text-xs text-muted">
                        {localizeWidgetField(t, widget, "description", widget.description)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium uppercase tracking-wide ${STATUS_STYLES[widget.status]}`}
                      >
                        <span className="material-symbols-outlined text-base" aria-hidden>
                          {widget.status === "ok"
                            ? "check_circle"
                            : widget.status === "no-data"
                            ? "info"
                            : "warning"}
                        </span>
                        {t(`dashboard.widget.status.${widget.status}` as const)}
                      </span>
                      {widget.reason ? <span>{widget.reason}</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
