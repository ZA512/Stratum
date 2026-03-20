"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export type CardActionMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

type CardActionMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  anchorPosition?: { x: number; y: number } | null;
  items: CardActionMenuItem[];
  onClose: () => void;
};

export function CardActionMenu({ open, anchorEl, anchorPosition = null, items, onClose }: CardActionMenuProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const position = useMemo(() => {
    if (!open || typeof window === 'undefined') return null;
    const menuWidth = 220;
    const menuHeight = Math.max(140, items.length * 42 + 12);
    if (anchorPosition) {
      const left = Math.max(8, Math.min(anchorPosition.x + 2, window.innerWidth - menuWidth - 8));
      const top = Math.max(8, Math.min(anchorPosition.y + 2, window.innerHeight - menuHeight - 8));
      return { left, top };
    }
    if (!anchorEl) return null;
    const rect = anchorEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 8));
    return { left, top };
  }, [open, anchorEl, anchorPosition, items.length]);

  if (!mounted || !open || !position) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[9999] cursor-default"
        aria-label="Fermer le menu"
        onClick={onClose}
      />
      <div
        role="menu"
        className="app-floating-panel fixed z-[10000] min-w-[220px] rounded-xl p-2 text-sm shadow-xl"
        style={{ top: position.top, left: position.left }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            disabled={item.disabled}
            className="app-toolbar mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition duration-150 first:mt-0 hover:-translate-y-px hover:bg-white/5 hover:shadow-[0_8px_18px_rgba(0,0,0,0.16)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center text-current">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}