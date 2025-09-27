"use client";
import React from "react";

// utilitaire léger pour concaténer des classes sans dépendance externe
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Types
export interface TaskAssignee {
  id: string;
  initials: string; // 2 lettres
  color?: string; // optionnel background override
}

export type TaskPriority = "Low" | "Medium" | "High" | "Critical";

export interface TaskCardProps {
  id: number | string;
  priority: TaskPriority;
  title: string;
  description?: string;
  assignees: TaskAssignee[];
  lateness?: number; // ex: -6 -> retard
  complexity?: string; // XL, L, M...
  fractalPath?: string; // ex: 4.0.0.1
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
}

// Helper palette (conserver les couleurs existantes)
const priorityBadgeClasses: Record<TaskPriority, string> = {
  Low: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  Critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export const TaskCard: React.FC<TaskCardProps> = ({
  id,
  priority,
  title,
  description,
  assignees,
  lateness,
  complexity,
  fractalPath,
  href,
  onClick,
  onFractalPathClick,
  onMenuButtonClick,
  hideInternalMenuButton = false,
  variant = "default",
  className,
}) => {
  const compact = variant === "compact";

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
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">#{id}</span>
          <span
            className={cx(
              "inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full leading-none",
              priorityBadgeClasses[priority]
            )}
          >
            {priority}
          </span>
        </div>
        {!hideInternalMenuButton && (
          <button
            type="button"
            aria-label="Actions de la tâche"
            onClick={(e) => { e.stopPropagation(); onMenuButtonClick?.(); }}
            className="p-1 -m-1 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          >
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>more_horiz</span>
          </button>
        )}
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
          <div className="flex -space-x-2">
            {assignees.slice(0, 4).map(a => (
              <div
                key={a.id}
                className="w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800 bg-blue-200 dark:bg-blue-900"
                style={a.color ? { backgroundColor: a.color } : undefined}
                title={a.initials}
              >
                <span className="text-xs font-bold text-blue-800 dark:text-blue-200">{a.initials}</span>
              </div>
            ))}
            {assignees.length > 4 && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800 bg-slate-200 dark:bg-slate-700">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">+{assignees.length - 4}</span>
              </div>
            )}
          </div>
          {typeof lateness === "number" && (
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
          )}
        </div>
        <div className="col-span-5 flex items-center justify-end gap-4">
          {complexity && (
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400" title="Complexité">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>weight</span>
              <span className="text-xs font-medium">{complexity}</span>
            </div>
          )}
          {fractalPath && (
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
                  const colors = ['text-amber-600 dark:text-amber-400', 'text-sky-600 dark:text-sky-400', 'text-red-600 dark:text-red-400', 'text-emerald-600 dark:text-emerald-400'];
                  return parts.map((part, i) => (
                    <React.Fragment key={i}>
                      <span className={colors[i] || 'text-gray-500'}>{part}</span>
                      {i < parts.length - 1 && <span className="text-slate-400">.</span>}
                    </React.Fragment>
                  ));
                })()}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-lg ring-0 group-hover:ring-2 ring-blue-500/10 transition" />
    </div>
  );
};

export default TaskCard;
