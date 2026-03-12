"use client";

import React, { type ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { NodeBreadcrumbItem } from "@/features/boards/boards-api";

export interface StackedBreadcrumbProps {
  items: NodeBreadcrumbItem[];
  children: ReactNode;
  onSelect?: (id: string) => void;
  buildHref?: (item: NodeBreadcrumbItem, depth: number) => string;
  onPreNavigate?: (targetItem: NodeBreadcrumbItem, depth: number) => void;
}

export function StackedBreadcrumb({
  items,
  children,
  onSelect,
  buildHref,
  onPreNavigate,
}: StackedBreadcrumbProps) {
  const router = useRouter();
  const currentDepth = items.length - 1;

  const handleNavigate = useCallback(
    (item: NodeBreadcrumbItem, depth: number) => {
      if (depth === currentDepth) {
        return;
      }

      if (onPreNavigate) {
        try {
          onPreNavigate(item, depth);
        } catch {
          // ignore prefetch failures
        }
      }

      const href = buildHref?.(item, depth);
      if (href) {
        router.push(href);
        return;
      }

      onSelect?.(item.id);
    },
    [buildHref, currentDepth, onPreNavigate, onSelect, router],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="lg:sticky lg:top-[92px]">
        <nav
          aria-label="Fil d'ariane"
          className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,17,39,0.94),rgba(10,18,35,0.78))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur"
        >
          <ol className="space-y-2">
            {items.map((item, index) => {
              const isCurrent = index === currentDepth;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item, index)}
                    disabled={isCurrent}
                    aria-current={isCurrent ? "page" : undefined}
                    title={item.title}
                    className={`flex w-full items-start rounded-2xl border px-3 py-3 text-left transition ${
                      isCurrent
                        ? "cursor-default border-accent/40 bg-accent/10 text-foreground shadow-[0_8px_20px_rgba(56,189,248,0.12)]"
                        : "border-white/5 bg-white/[0.03] text-muted hover:border-white/15 hover:bg-white/[0.06] hover:text-foreground"
                    }`}
                  >
                    <span className="mr-3 mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
                    <span className="min-w-0 text-sm font-medium uppercase tracking-[0.08em] leading-5">
                      <span className="block truncate">{item.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
