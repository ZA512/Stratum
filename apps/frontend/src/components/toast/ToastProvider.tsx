"use client";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  kind?: ToastKind;
  duration?: number; // ms
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
}

export interface Toast extends Required<Pick<ToastOptions, "id" | "kind" | "duration" | "dismissible">> {
  title?: string;
  description?: string;
  createdAt: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  push: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  success: (msg: string, opts?: Omit<ToastOptions, "kind" | "description">) => string;
  error: (msg: string, opts?: Omit<ToastOptions, "kind" | "description">) => string;
  info: (msg: string, opts?: Omit<ToastOptions, "kind" | "description">) => string;
  warning: (msg: string, opts?: Omit<ToastOptions, "kind" | "description">) => string;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 3500;
const GEN_ID = () => Math.random().toString(36).slice(2, 10);

export const ToastProvider: React.FC<React.PropsWithChildren<{ max?: number }>> = ({ children, max = 6 }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number | NodeJS.Timeout>>(new Map());

  const scheduleRemoval = useCallback((id: string, duration: number) => {
    if (timers.current.has(id)) return;
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, duration);
    timers.current.set(id, t);
  }, []);

  const push = useCallback((opts: ToastOptions) => {
    const id = opts.id || GEN_ID();
    setToasts((prev) => {
      const next: Toast[] = [
        ...prev,
        {
          id,
            kind: opts.kind || "info",
            duration: opts.duration ?? DEFAULT_DURATION,
            dismissible: opts.dismissible ?? true,
            title: opts.title,
            description: opts.description,
            createdAt: Date.now(),
            actionLabel: opts.actionLabel,
            onAction: opts.onAction,
        },
      ];
      if (next.length > max) next.splice(0, next.length - max);
      return next;
    });
    scheduleRemoval(id, opts.duration ?? DEFAULT_DURATION);
    return id;
  }, [max, scheduleRemoval]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const factory = useCallback((kind: ToastKind) => (msg: string, opts: Omit<ToastOptions, "kind" | "description"> = {}) =>
    push({ ...opts, kind, description: msg }), [push]);

  const value: ToastContextValue = {
    push,
    dismiss,
    success: factory("success"),
    error: factory("error"),
    info: factory("info"),
    warning: factory("warning"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};

const colorByKind: Record<ToastKind, string> = {
  success: "bg-emerald-600 border-emerald-500",
  error: "bg-rose-600 border-rose-500",
  info: "bg-slate-700 border-slate-600",
  warning: "bg-amber-600 border-amber-500",
};

const iconByKind: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "!",
};

const ToastViewport: React.FC<{ toasts: Toast[]; dismiss: (id: string) => void }> = ({ toasts, dismiss }) => {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[100vw] flex-col gap-3">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.9 }}
            className={`pointer-events-auto flex overflow-hidden rounded-md border shadow-lg backdrop-blur-sm text-white ${colorByKind[t.kind]}`}
          >
            <div className="flex w-full items-start gap-3 px-4 py-3">
              <div className="pt-0.5 text-lg leading-none select-none">{iconByKind[t.kind]}</div>
              <div className="flex-1 min-w-0">
                {t.title && <p className="font-semibold text-sm leading-tight mb-0.5 line-clamp-2">{t.title}</p>}
                {t.description && (
                  <p className="text-sm leading-snug text-white/90 whitespace-pre-wrap break-words">
                    {t.description}
                  </p>
                )}
                {t.actionLabel && t.onAction && (
                  <button
                    onClick={() => { t.onAction?.(); dismiss(t.id); }}
                    className="mt-2 inline-flex rounded bg-white/15 px-2 py-1 text-xs font-medium hover:bg-white/25 transition-colors"
                  >
                    {t.actionLabel}
                  </button>
                )}
              </div>
              {t.dismissible && (
                <button
                  onClick={() => dismiss(t.id)}
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors text-sm"
                  aria-label="Fermer notification"
                >
                  ×
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
