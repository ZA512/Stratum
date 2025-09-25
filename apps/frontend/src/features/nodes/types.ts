// Legacy checklist types supprimés après migration

export type NodeChild = {
  id: string;
  type: 'SIMPLE' | 'COMPLEX';
  title: string;
  behaviorKey?: 'BACKLOG' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  columnId?: string | null;
};

export type NodeAssignment = {
  id: string;
  userId: string;
  role: string | null;
};

export type NodeDetail = {
  id: string;
  teamId: string;
  parentId: string | null;
  type: 'SIMPLE' | 'COMPLEX';
  title: string;
  description: string | null;
  path: string;
  depth: number;
  columnId: string | null;
  dueAt: string | null;
  statusMetadata: Record<string, unknown> | null;
  progress: number; // 0-100
  blockedReminderEmails: string[];
  blockedReminderIntervalDays: number | null;
  blockedExpectedUnblockAt: string | null;
  priority: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  effort: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  tags?: string[];
  assignments: NodeAssignment[];
  // checklist retirée du modèle après migration
  checklist?: undefined;
  children: NodeChild[];
  summary?: {
    counts: {
      backlog: number;
      inProgress: number;
      blocked: number;
      done: number;
    };
  };
  board?: { id: string; columns: { id: string; behaviorKey: string | null }[] };
};
