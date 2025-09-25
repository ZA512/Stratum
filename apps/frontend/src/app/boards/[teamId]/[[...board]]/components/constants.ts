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
