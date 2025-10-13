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
  onFractalPathClick?: () => void;
  /** Clic sur le bouton menu (trois points) */
  onMenuButtonClick?: () => void;
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
}

// Helper palette (conserver les couleurs existantes)
const priorityBadgeClasses: Record<TaskPriority, string> = {
  Low: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  Critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

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
  onFractalPathClick,
  onMenuButtonClick,
  hideInternalMenuButton = false,
  variant = "default",
  className,
  assigneeTooltip,
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
      className={cx(
        "group relative rounded-lg bg-white dark:bg-gray-800 shadow-md ring-1 ring-gray-200 dark:ring-gray-700 hover:shadow-lg transition-shadow",
        onClick && "cursor-pointer",
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
            const content = <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">#{id}</span>;
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
                className={cx(
                  "inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full leading-none",
                  priorityBadgeClasses[priority]
                )}
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
              className="p-1 -m-1 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
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
        <h3 className={cx("font-bold text-base text-gray-800 dark:text-gray-100", compact ? "mb-0.5" : "mb-1 pr-2")}>{title}</h3>
        {!compact && description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">{description}</p>
        )}
      </div>
      <div className="h-px bg-gray-200 dark:bg-gray-700 mx-4" />
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
                    className="w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800 bg-blue-200 dark:bg-blue-900"
                    style={a.color ? { backgroundColor: a.color } : undefined}
                    // Supprime title natif pour éviter conflit avec tooltip multi-ligne
                    aria-label={a.displayName || a.initials}
                  >
                    <span className="text-xs font-bold text-blue-800 dark:text-blue-200">{a.initials}</span>
                  </div>
                ))}
                {assignees.length > 4 && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800 bg-slate-200 dark:bg-slate-700">
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">+{assignees.length - 4}</span>
                  </div>
                )}
                {computedTooltip && raciOpen && (
                  <div
                    id={raciTooltipId}
                    role="tooltip"
                    className="absolute left-0 top-full z-50 mt-2 w-max max-w-xs origin-top-left rounded-md border border-white/10 bg-gray-900/95 px-3 py-2 text-[11px] leading-relaxed text-gray-100 shadow-xl whitespace-pre-line"
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
              <div className={cx(
                "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
                // Très en retard (< -7 jours) : rouge vif
                lateness < -7 ? "bg-red-500/20 border border-red-500/30 text-red-300" :
                // En retard (< 0) : rouge-orange
                lateness < 0 ? "bg-orange-500/20 border border-orange-500/30 text-orange-300" :
                // À temps (0-3 jours) : vert
                lateness <= 3 ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300" :
                // Confortable (4-7 jours) : vert clair
                lateness <= 7 ? "bg-green-500/20 border border-green-500/30 text-green-300" :
                // Très à l'avance (>7 jours) : bleu-vert
                "bg-teal-500/20 border border-teal-500/30 text-teal-300"
              )}>
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
        <div className="col-span-5 flex items-center justify-end gap-4">
          {/* Slot progression (fixe) - on garde seulement le pourcentage */}
          {showProgress && (() => {
            const tooltip = pickTooltipEntry(helpMessages?.progress, helpMode);
            const chip = (
              <div
                className="flex items-center justify-center min-w-[42px] h-5 rounded-md bg-gray-200/40 dark:bg-gray-700/40 text-[11px] font-semibold text-gray-700 dark:text-gray-200"
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
              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400" title="Complexité">
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
                className="relative z-10 flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded-sm px-1 -mx-1"
                title="Ouvrir le kanban enfant"
              >
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>link</span>
                <span className="flex items-center gap-[1px] font-mono text-[11px]">
                  {(() => {
                    const parts = fractalPath.split('.');
                    // Ordre des couleurs : Bleu (Backlog), Jaune (En cours), Rouge (Bloqué), Vert (Terminé)
                    const colors = ['text-sky-600 dark:text-sky-400', 'text-amber-600 dark:text-amber-400', 'text-red-600 dark:text-red-400', 'text-emerald-600 dark:text-emerald-400'];
                    return parts.map((part, i) => (
                      <React.Fragment key={i}>
                        <span className={colors[i] || 'text-gray-500'}>{part}</span>
                        {i < parts.length - 1 && <span className="text-slate-400">.</span>}
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
      <div className="pointer-events-none absolute inset-0 rounded-lg ring-0 group-hover:ring-2 ring-blue-500/10 transition" />
    </div>
  );
};

export default TaskCard;
