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
  displayName?: string;
  avatarUrl?: string | null;
};

export type NodeComment = {
  id: string;
  nodeId: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  notify: {
    responsible: boolean;
    accountable: boolean;
    consulted: boolean;
    informed: boolean;
    project: boolean;
    subProject: boolean;
  };
  mentions: {
    userId: string;
    displayName: string;
    email: string;
  }[];
};

export type NodeDetail = {
  id: string;
  shortId: number;
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
  raci: {
    responsibleIds: string[];
    accountableIds: string[];
    consultedIds: string[];
    informedIds: string[];
  };
  timeTracking?: {
    estimatedTimeHours: number | null;
    actualOpexHours: number | null;
    actualCapexHours: number | null;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    actualEndDate: string | null;
  };
  financials?: {
    billingStatus: 'TO_BILL'|'BILLED'|'PAID' | null;
    hourlyRate: number | null;
    plannedBudget: number | null;
    consumedBudgetValue: number | null;
    consumedBudgetPercent: number | null;
    actualCost: number | null;
  };
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
  comments: NodeComment[];
};
