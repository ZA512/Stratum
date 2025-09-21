"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeBreadcrumbItem } from "@/features/boards/boards-api";

const BASE_HUE = 190;
const BASE_SATURATION = 85;
const BASE_LIGHTNESS = 45;

function generateStrata(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const depthFactor = index / Math.max(count - 1, 1);
    const hue = (BASE_HUE + depthFactor * 20) % 360;
    const saturation = Math.max(30, BASE_SATURATION - depthFactor * 35);
    const lightness = Math.min(80, BASE_LIGHTNESS + depthFactor * 20);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  });
}

export type FractalBreadcrumbProps = {
  items: NodeBreadcrumbItem[];
  loading: boolean;
  onSelect: (nodeId: string) => void;
};

export function FractalBreadcrumb({ items, loading, onSelect }: FractalBreadcrumbProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (items.length) {
      setActiveIndex(items.length - 1);
    } else {
      setActiveIndex(null);
    }
  }, [items.length]);

  const palette = useMemo(() => generateStrata(items.length), [items.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex((previous) => {
        if (previous === null) return items.length - 1;
        return Math.max(0, previous - 1);
      });
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex((previous) => {
        if (previous === null) return 0;
        return Math.min(items.length - 1, previous + 1);
      });
    }

    if (event.key === "Enter" || event.key === " ") {
      const current = activeIndex ?? items.length - 1;
      const target = items[current];
      if (target && !loading) {
        onSelect(target.id);
      }
    }
  };

  return (
    <div
      ref={focusRef}
      role="navigation"
      aria-label="Fil d'Ariane fractal"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="group/fractal relative isolate flex min-h-[72px] w-full items-center overflow-hidden rounded-2xl border border-white/10 bg-surface/70 px-4 py-3 shadow-inner shadow-black/40 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {loading ? (
        <span className="text-xs uppercase tracking-wide text-muted">Chargement du breadcrumb…</span>
      ) : null}

      {!loading && items.length === 0 ? (
        <span className="text-xs uppercase tracking-wide text-muted">Board racine</span>
      ) : null}

      {!loading && items.length > 0 ? (
        <ul className="relative flex w-full items-center justify-start gap-2" aria-live="polite">
          {items.map((item, index) => {
            const isActive = index === items.length - 1;
            const color = palette[index];
            const nextColor = palette[index + 1] ?? color;
            const gradient = `linear-gradient(130deg, ${color}, ${nextColor})`;
            const offset = index * 6;

            return (
              <li key={item.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  onFocus={() => setActiveIndex(index)}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium uppercase transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    isActive
                      ? "text-foreground shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                      : "text-slate-200/80 hover:text-foreground"
                  }`}
                  style={{
                    backgroundImage: gradient,
                    transform: `translateX(${offset}px)`
                  }}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-white/80" />
                  <span className="text-[11px] tracking-[0.45em]">{item.title}</span>
                  <span className="sr-only">{isActive ? "niveau courant" : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

