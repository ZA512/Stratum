"use client";
import React, { useState, useId, useRef, useEffect, useCallback } from "react";
import { HelpTooltip } from "@/components/ui/help-tooltip";

// utilitaire léger pour concaténer des classes sans dépendance externe
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Types
export interface TaskAssignee {
  id: string;
  initials: string; // 2 lettres
  color?: string; // optionnel background override
  displayName?: string;
}

export type TaskPriority = "Low" | "Medium" | "High" | "Critical";

type TooltipCopy = {
  title?: string;
  description?: React.ReactNode;
  hint?: React.ReactNode;
};

type TooltipEntry = {
  help?: TooltipCopy;
  info?: TooltipCopy;
  align?: "left" | "right";
  widthClassName?: string;
};

export interface TaskCardProps {
  id: number | string;
  priority: TaskPriority;
  title: string;
  description?: string;
  assignees: TaskAssignee[];
  lateness?: number; // ex: -6 -> retard
  complexity?: string; // XL, L, M...
  fractalPath?: string; // ex: 4.0.0.1
  progress?: number;
  href?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onFractalPathClick?: () => void;
  /** Clic sur le bouton menu (trois points) */
  onMenuButtonClick?: () => void;
  /** Ref externe pour positionner un menu custom */
  menuButtonRef?: React.Ref<HTMLButtonElement>;
  /** Masque le bouton menu interne (utilisé quand un menu externe est injecté) */
  hideInternalMenuButton?: boolean;
  /**
   * Variante d'affichage:
   * - default: description visible, padding normal
   * - compact: description masquée, padding vertical réduit
  */
  variant?: "default" | "compact";
  className?: string;
  /** Tooltip RACI déjà calculé (multi-ligne). Si absent on utilisera raci*Ids pour un fallback minimal. */
  assigneeTooltip?: string;
  /** Fallback listes d'IDs R/A/C/I (héritage possible d'anciennes intégrations) */
  responsibleIds?: string[];
  accountableIds?: string[];
  consultedIds?: string[];
  informedIds?: string[];
  showId?: boolean;
  showPriority?: boolean;
  showAssignees?: boolean;
  showDueDate?: boolean;
  showProgress?: boolean;
  showEffort?: boolean;
  helpMode?: boolean;
  helpMessages?: Partial<Record<
    "id" | "priority" | "menu" | "assignees" | "dueDate" | "progress" | "effort" | "fractal",
    TooltipEntry
  >>;
  /** Indique si la tâche est partagée avec plusieurs utilisateurs */
  isShared?: boolean;
  fractalActionIcon?: React.ReactNode;
  fractalActionLabel?: string;
}

const priorityBadgeStyles: Record<TaskPriority, React.CSSProperties> = {
  Low: {
    borderColor: "color-mix(in srgb, var(--color-success) 34%, var(--color-border) 66%)",
    background: "var(--color-success-soft)",
    color: "var(--color-success)",
  },
  Medium: {
    borderColor: "color-mix(in srgb, var(--color-info) 34%, var(--color-border) 66%)",
    background: "var(--color-info-soft)",
    color: "var(--color-info)",
  },
  High: {
    borderColor: "color-mix(in srgb, var(--color-warning) 34%, var(--color-border) 66%)",
    background: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
  Critical: {
    borderColor: "color-mix(in srgb, var(--color-danger) 34%, var(--color-border) 66%)",
    background: "var(--color-danger-soft)",
    color: "var(--color-danger)",
  },
};

function getLatenessStyle(lateness: number): React.CSSProperties {
  if (lateness < -7) {
    return {
      borderColor: "color-mix(in srgb, var(--color-danger) 34%, var(--color-border) 66%)",
      background: "var(--color-danger-soft)",
      color: "var(--color-danger)",
    };
  }
  if (lateness < 0) {
    return {
      borderColor: "color-mix(in srgb, var(--color-warning) 36%, var(--color-border) 64%)",
      background: "var(--color-warning-soft)",
      color: "var(--color-warning)",
    };
  }
  if (lateness <= 3) {
    return {
      borderColor: "color-mix(in srgb, var(--color-success) 34%, var(--color-border) 66%)",
      background: "var(--color-success-soft)",
      color: "var(--color-success)",
    };
  }
  if (lateness <= 7) {
    return {
      borderColor: "color-mix(in srgb, var(--color-info) 34%, var(--color-border) 66%)",
      background: "var(--color-info-soft)",
      color: "var(--color-info)",
    };
  }
  return {
    borderColor: "color-mix(in srgb, var(--color-accent) 30%, var(--color-border) 70%)",
    background: "color-mix(in srgb, var(--color-accent-soft) 88%, transparent)",
    color: "var(--color-accent)",
  };
}

const fractalPathColors = [
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--color-success)",
];

function pickTooltipEntry(entry: TooltipEntry | undefined, helpMode: boolean): (TooltipCopy & {
  align?: "left" | "right";
  widthClassName?: string;
}) | null {
  if (!entry) {
    return null;
  }

  const source = helpMode ? (entry.help ?? entry.info) : entry.info;
  if (!source) {
    return null;
  }

  const hasDescription = typeof source.description === "string" ? source.description.trim().length > 0 : Boolean(source.description);
  const hasTitle = typeof source.title === "string" ? source.title.trim().length > 0 : Boolean(source.title);
  const hasHint = typeof source.hint === "string" ? source.hint.trim().length > 0 : Boolean(source.hint);

  if (!hasTitle && !hasDescription && !hasHint) {
    return null;
  }

  return {
    title: source.title,
    description: source.description,
    hint: source.hint,
    align: entry.align,
    widthClassName: entry.widthClassName,
  };
}

export const TaskCard: React.FC<TaskCardProps> = ({
  id,
  priority,
  title,
  description,
  assignees,
  lateness,
  complexity,
  fractalPath,
  progress,
  href: _href,
  onClick,
  onDoubleClick,
  onFractalPathClick,
  onMenuButtonClick,
  menuButtonRef,
  hideInternalMenuButton = false,
  variant = "default",
  className,
  assigneeTooltip,
  isShared = false,
  responsibleIds,
  accountableIds,
  consultedIds,
  informedIds,
  showId = true,
  showPriority = true,
  showAssignees = true,
  showDueDate = true,
  showProgress = true,
  showEffort = true,
  helpMode = false,
  helpMessages,
  fractalActionIcon,
  fractalActionLabel,
}) => {
  void _href;
  const compact = variant === "compact";

  const [raciOpen, setRaciOpen] = useState(false);
  const raciTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const raciTooltipId = useId();
  const clearTimer = () => { if(raciTimerRef.current){ window.clearTimeout(raciTimerRef.current); raciTimerRef.current=null; } };
  // Tooltip effectif = assigneeTooltip (préféré) sinon construction minimale depuis listes d'IDs si fournies
  const computedTooltip = React.useMemo(()=>{
    if (assigneeTooltip && assigneeTooltip.trim().length > 0) {
      return assigneeTooltip;
    }
    const lines: string[] = [];
    const build = (label: string, arr?: string[]) => {
      if (!arr) return;
      lines.push(`${label} : ${arr.length ? arr.join(', ') : '-'}`);
    };
    build('R', responsibleIds);
    build('A', accountableIds);
    build('C', consultedIds);
    build('I', informedIds);
    return lines.length ? lines.join('\n') : undefined;
  }, [assigneeTooltip, responsibleIds, accountableIds, consultedIds, informedIds]);

  const handleRaciOpen = useCallback(() => {
    if(!computedTooltip) return; // rien à afficher
    if(raciOpen) return;
    clearTimer();
    raciTimerRef.current = window.setTimeout(()=>{ if(mountedRef.current) setRaciOpen(true); },150) as unknown as number;
  }, [computedTooltip, raciOpen]);
  
  const handleRaciClose = useCallback(() => { clearTimer(); setRaciOpen(false); }, []);

  useEffect(()=>()=>{ mountedRef.current=false; clearTimer(); },[]);

  useEffect(()=>{
    if(!raciOpen) return;
    const onScroll = () => { handleRaciClose(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [raciOpen, handleRaciClose]);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cx(
        "app-panel group relative rounded-[1.1rem] text-foreground shadow-lg transition hover:border-[color:var(--color-accent)]/50",
        onClick &&
          "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {showId && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.id, helpMode);
            const content = <span className="text-xs font-semibold text-muted">#{id}</span>;
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align}
                widthClassName={tooltip.widthClassName}
              >
                {content}
              </HelpTooltip>
            ) : content;
          })()}
          {showPriority && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.priority, helpMode);
            const content = (
              <span
                className="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none"
                style={priorityBadgeStyles[priority]}
              >
                {priority}
              </span>
            );
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align}
                widthClassName={tooltip.widthClassName}
              >
                {content}
              </HelpTooltip>
            ) : content;
          })()}
        </div>
        {!hideInternalMenuButton && (() => {
          const tooltip = pickTooltipEntry(helpMessages?.menu, helpMode);
          const button = (
            <button
              type="button"
              aria-label="Actions de la tâche"
              onClick={(e) => { e.stopPropagation(); onMenuButtonClick?.(); }}
              ref={menuButtonRef}
              className="-m-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted/70 transition hover:bg-white/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="material-icons-outlined" style={{ fontSize: 20 }}>more_horiz</span>
            </button>
          );
          return tooltip ? (
            <HelpTooltip
              helpMode={helpMode}
              mode="always"
              title={tooltip.title}
              description={tooltip.description}
              hint={tooltip.hint}
              align={tooltip.align ?? "right"}
              widthClassName={tooltip.widthClassName}
            >
              {button}
            </HelpTooltip>
          ) : button;
        })()}
      </div>
      {/* Corps */}
      <div className={cx("px-4", compact ? "pb-2" : "pb-3")}>
        <h3 className={cx("font-bold text-base text-foreground flex items-center gap-1.5", compact ? "mb-0.5" : "mb-1 pr-2")}>
          {isShared && (
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              height="18" 
              viewBox="0 -960 960 960" 
              width="18" 
              className="shrink-0" 
              style={{ fill: 'var(--color-muted)' }}
              aria-label="Tâche partagée"
            >
              <path d="M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780Zm-455-80h311q-10-20-55.5-35T480-370q-55 0-100.5 15T325-320ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Zm0-80q17 0 28.5-11.5T520-600q0-17-11.5-28.5T480-640q-17 0-28.5 11.5T440-600q0 17 11.5 28.5T480-560Zm1 240Zm-1-280Z"/>
            </svg>
          )}
          {title}
        </h3>
        {!compact && description && (
          <p className="text-sm leading-snug text-muted">{description}</p>
        )}
      </div>
      <div className="mx-4 h-px bg-[color:var(--color-border-subtle)]" />
      {/* Pied */}
      <div className={cx("px-4", compact ? "py-2" : "py-3", "grid grid-cols-12 items-center gap-3")}>        
        <div className="col-span-7 flex items-center gap-3 min-w-0">
          {showAssignees && assignees.length > 0 && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.assignees, helpMode);
            const avatarStack = (
              <div
                className="relative flex -space-x-2 min-w-[28px]"
                onMouseEnter={computedTooltip ? handleRaciOpen : undefined}
                onMouseLeave={computedTooltip ? handleRaciClose : undefined}
                onFocus={computedTooltip ? handleRaciOpen : undefined}
                onBlur={computedTooltip ? handleRaciClose : undefined}
                aria-describedby={computedTooltip && raciOpen ? raciTooltipId : undefined}
              >
                {assignees.slice(0, 4).map(a => (
                  <div
                    key={a.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-[color:var(--color-background)]"
                    style={a.color ? { backgroundColor: a.color } : { background: "color-mix(in srgb, var(--color-accent-soft) 88%, var(--color-surface-raised) 12%)" }}
                    // Supprime title natif pour éviter conflit avec tooltip multi-ligne
                    aria-label={a.displayName || a.initials}
                  >
                    <span className="text-xs font-bold" style={{ color: a.color ? "var(--color-accent-foreground)" : "var(--color-accent)" }}>{a.initials}</span>
                  </div>
                ))}
                {assignees.length > 4 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-[color:var(--color-background)] bg-surface/70">
                    <span className="text-[10px] font-semibold text-muted">+{assignees.length - 4}</span>
                  </div>
                )}
                {computedTooltip && raciOpen && (
                  <div
                    id={raciTooltipId}
                    role="tooltip"
                    className="app-panel absolute left-0 top-full z-50 mt-2 w-max max-w-xs origin-top-left whitespace-pre-line rounded-md px-3 py-2 text-[11px] leading-relaxed text-foreground shadow-xl"
                  >
                    {computedTooltip}
                  </div>
                )}
              </div>
            );
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align}
                widthClassName={tooltip.widthClassName}
              >
                {avatarStack}
              </HelpTooltip>
            ) : avatarStack;
          })()}
          {showDueDate && typeof lateness === "number" && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.dueDate, helpMode);
            const badge = (
              <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium" style={getLatenessStyle(lateness)}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>timer</span>
                <span className="-mt-px">{lateness}</span>
              </div>
            );
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align}
                widthClassName={tooltip.widthClassName}
              >
                {badge}
              </HelpTooltip>
            ) : badge;
          })()}
        </div>
        <div className="col-span-5 flex min-h-7 items-center justify-end gap-4 self-center">
          {/* Slot progression (fixe) - on garde seulement le pourcentage */}
          {showProgress && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.progress, helpMode);
            const chip = (
              <div
                className="app-badge flex h-5 min-w-[42px] items-center justify-center rounded-md text-[11px] font-semibold text-foreground"
                title={typeof progress === 'number' ? `Progression ${Math.min(Math.max(progress, 0), 100)}%` : 'Aucune progression'}
                aria-label="Progression"
              >
                {typeof progress === 'number' ? `${Math.min(Math.max(Math.round(progress), 0), 100)}%` : '--'}
              </div>
            );
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align ?? "right"}
                widthClassName={tooltip.widthClassName}
              >
                {chip}
              </HelpTooltip>
            ) : chip;
          })()}
          {showEffort && complexity && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.effort, helpMode);
            const badge = (
              <div className="flex items-center gap-1 text-muted" title="Complexité">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>weight</span>
                <span className="text-xs font-medium">{complexity}</span>
              </div>
            );
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align ?? "right"}
                widthClassName={tooltip.widthClassName}
              >
                {badge}
              </HelpTooltip>
            ) : badge;
          })()}
          {fractalPath && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.fractal, helpMode);
            const button = (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFractalPathClick?.();
                }}
                className="relative z-10 -mx-1 inline-flex h-7 items-center gap-1.5 rounded-sm px-1 text-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title={fractalActionLabel ?? "Ouvrir le kanban enfant"}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-current">
                  {fractalActionIcon ?? <span className="material-icons-outlined" style={{ fontSize: 16 }}>link</span>}
                </span>
                <span className="flex items-center gap-[1px] self-center font-mono text-[11px] font-semibold leading-none">
                  {(() => {
                    const parts = fractalPath.split('.');
                    return parts.map((part, i) => (
                      <React.Fragment key={i}>
                        <span style={{ color: fractalPathColors[i] || 'var(--color-foreground-subtle)' }}>{part}</span>
                        {i < parts.length - 1 && <span className="text-muted">.</span>}
                      </React.Fragment>
                    ));
                  })()}
                </span>
              </button>
            );
            return tooltip ? (
              <HelpTooltip
                helpMode={helpMode}
                mode="always"
                title={tooltip.title}
                description={tooltip.description}
                hint={tooltip.hint}
                align={tooltip.align ?? "right"}
                widthClassName={tooltip.widthClassName}
              >
                {button}
              </HelpTooltip>
            ) : button;
          })()}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-[1.1rem] ring-0 transition group-hover:ring-2 group-hover:ring-accent/30" />
    </div>
  );
};

export default TaskCard;
