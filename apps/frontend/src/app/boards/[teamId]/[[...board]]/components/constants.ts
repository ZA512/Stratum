export const BEHAVIOR_LABELS = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'En cours',
  BLOCKED: 'Bloqué',
  DONE: 'Terminé',
  CUSTOM: 'Custom'
} as const;

export const BEHAVIOR_COLOR_CLASSES: Record<string,string> = {
  BACKLOG: 'bg-blue-700',
  IN_PROGRESS: 'bg-amber-400',
  BLOCKED: 'bg-red-600',
  DONE: 'bg-emerald-600',
  CUSTOM: 'bg-slate-500'
};

export const BEHAVIOR_BAR_BG_CLASSES: Record<string, string> = {
  BACKLOG: 'bg-blue-500/25',
  IN_PROGRESS: 'bg-amber-400/25',
  BLOCKED: 'bg-red-500/25',
  DONE: 'bg-emerald-500/25',
  CUSTOM: 'bg-slate-500/25',
};

export const BEHAVIOR_ACCENT_CLASSES: Record<string, string> = {
  BACKLOG: 'bg-blue-400',
  IN_PROGRESS: 'bg-amber-300',
  BLOCKED: 'bg-red-400',
  DONE: 'bg-emerald-400',
  CUSTOM: 'bg-slate-400',
};
