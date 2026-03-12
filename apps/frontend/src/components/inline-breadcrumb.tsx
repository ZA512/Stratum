"use client";

import React, { type ReactNode, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { NodeBreadcrumbItem } from "@/features/boards/boards-api";

export interface InlineBreadcrumbProps {
  items: NodeBreadcrumbItem[];
  children: ReactNode;
  onSelect?: (id: string) => void;
  buildHref?: (item: NodeBreadcrumbItem, depth: number) => string;
  onPreNavigate?: (targetItem: NodeBreadcrumbItem, depth: number) => void;
}

export function InlineBreadcrumb({
  items,
  children,
  onSelect,
  buildHref,
  onPreNavigate,
}: InlineBreadcrumbProps) {
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
    <div className="space-y-4">
      <nav
        aria-label="Fil d'ariane"
        className="overflow-x-auto rounded-2xl border border-white/10 bg-card/70 px-4 py-3 shadow-md"
      >
        <ol className="flex min-w-max items-center gap-2 text-sm">
          {items.map((item, index) => {
            const isCurrent = index === currentDepth;
            return (
              <React.Fragment key={item.id}>
                {index > 0 ? (
                  <li aria-hidden="true" className="text-muted/70">
                    &gt;
                  </li>
                ) : null}
                <li>
                  <button
                    type="button"
                    onClick={() => handleNavigate(item, index)}
                    disabled={isCurrent}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 transition ${
                      isCurrent
                        ? "cursor-default bg-accent/15 font-semibold text-foreground"
                        : "text-muted hover:bg-white/5 hover:text-foreground"
                    }`}
                    title={item.title}
                  >
                    {item.title}
                  </button>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
      {children}
    </div>
  );
}
