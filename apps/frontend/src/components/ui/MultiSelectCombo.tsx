"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface MultiSelectOption {
  id: string;
  label: string;
  description?: string;
  /** Optional precomputed string used for filtering */
  searchText?: string;
}

export interface MultiSelectComboProps {
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  noResultsMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * If true, keeps the menu open after each selection.
   * Useful for multi-select behaviours where several selections happen in a row.
   */
  keepMenuOpen?: boolean;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const MultiSelectCombo: React.FC<MultiSelectComboProps> = ({
  options,
  selectedIds,
  onChange,
  placeholder = 'Sélectionner…',
  searchPlaceholder = 'Rechercher…',
  emptyMessage = 'Aucune option disponible',
  noResultsMessage = 'Aucun résultat',
  disabled = false,
  className,
  keepMenuOpen = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const normalizedQuery = query.trim() ? normalize(query.trim()) : '';

  const normalizedOptions = useMemo(() => {
    return options.map((option) => ({
      ...option,
      _search: option.searchText
        ? normalize(option.searchText)
        : normalize(`${option.label} ${option.description ?? ''}`),
    }));
  }, [options]);

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return normalizedOptions;
    return normalizedOptions.filter((option) => option._search.includes(normalizedQuery));
  }, [normalizedOptions, normalizedQuery]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const resetHighlight = useCallback(() => setHighlightedIndex(filteredOptions.length > 0 ? 0 : null), [filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    resetHighlight();
  }, [open, resetHighlight]);

  useEffect(() => {
    if (!open) return;
    if (highlightedIndex === null) return;
    const list = listRef.current;
    const item = list?.querySelector<HTMLButtonElement>(`[data-index="${highlightedIndex}"]`);
    if (item && list) {
      const { offsetTop, offsetHeight } = item;
      const { scrollTop, clientHeight } = list;
      if (offsetTop < scrollTop) {
        list.scrollTo({ top: offsetTop, behavior: 'smooth' });
      } else if (offsetTop + offsetHeight > scrollTop + clientHeight) {
        list.scrollTo({ top: offsetTop + offsetHeight - clientHeight, behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, open]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
      setHighlightedIndex(null);
      setQuery('');
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  const toggleOption = useCallback((id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }, [onChange, selectedIds, selectedSet]);

  const removeOption = useCallback((id: string) => {
    if (!selectedSet.has(id)) return;
    onChange(selectedIds.filter((value) => value !== id));
  }, [onChange, selectedIds, selectedSet]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && query === '' && selectedIds.length > 0) {
      event.preventDefault();
      const last = selectedIds[selectedIds.length - 1];
      removeOption(last);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(null);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return null;
        if (prev === null) return 0;
        return Math.min(filteredOptions.length - 1, prev + 1);
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return null;
        if (prev === null) return filteredOptions.length - 1;
        return Math.max(0, prev - 1);
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        resetHighlight();
        return;
      }

      if (highlightedIndex !== null && filteredOptions[highlightedIndex]) {
        const option = filteredOptions[highlightedIndex];
        toggleOption(option.id);
        if (!keepMenuOpen) {
          setOpen(false);
        }
        return;
      }

      const first = filteredOptions.find((option) => !selectedSet.has(option.id));
      if (first) {
        toggleOption(first.id);
        if (!keepMenuOpen) {
          setOpen(false);
        }
      }
    }
  }, [filteredOptions, highlightedIndex, keepMenuOpen, open, query, removeOption, resetHighlight, selectedIds, selectedSet, toggleOption]);

  const handleFocus = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const selectedOptions = useMemo(() => {
    const map = new Map(normalizedOptions.map((option) => [option.id, option]));
    return selectedIds
      .map((id) => map.get(id))
      .filter((option): option is (typeof normalizedOptions)[number] => Boolean(option));
  }, [normalizedOptions, selectedIds]);

  return (
    <div ref={containerRef} className={`relative text-sm ${className ?? ''}`}>
      <div
        className={`relative flex min-h-[40px] cursor-text flex-wrap items-center gap-2 rounded border px-3 py-2 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
          disabled ? 'cursor-not-allowed border-white/10 bg-surface/40 text-muted' : 'border-white/15 bg-surface/70 hover:border-accent/60'
        }`}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {selectedOptions.length === 0 && (
          <span className="pointer-events-none select-none text-[11px] text-muted">{placeholder}</span>
        )}
        {selectedOptions.map((option) => (
          <span
            key={option.id}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-foreground"
          >
            {option.label}
            <button
              type="button"
              className="text-[10px] text-muted transition hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                removeOption(option.id);
              }}
              aria-label={`Retirer ${option.label}`}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) {
              setOpen(true);
            }
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={selectedOptions.length === 0 ? undefined : searchPlaceholder}
          className={`flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-[11px] placeholder:text-muted ${
            disabled ? 'cursor-not-allowed opacity-70' : ''
          }`}
          disabled={disabled}
        />
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-white/15 bg-surface/95 shadow-xl backdrop-blur"
        >
          {normalizedOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">{emptyMessage}</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">{noResultsMessage}</div>
          ) : (
            filteredOptions.map((option, index) => {
              const active = selectedSet.has(option.id);
              const highlighted = index === highlightedIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-index={index}
                  onClick={() => {
                    toggleOption(option.id);
                    if (!keepMenuOpen) {
                      setOpen(false);
                    }
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    highlighted ? 'bg-accent/20 text-foreground' : 'hover:bg-white/10'
                  } ${active ? 'text-foreground' : 'text-muted'}`}
                >
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="text-[11px] text-muted">{option.description}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelectCombo;
