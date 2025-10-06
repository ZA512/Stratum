import type { BoardNode, BoardColumn } from '@/features/boards/boards-api';

// UI-enriched type if needed later (currently identical pass-through)
export interface BoardColumnWithNodes extends BoardColumn {
  nodes?: BoardNode[];
}

export type CardDisplayOptions = {
  showShortId: boolean;
  showPriority: boolean;
  showOwner: boolean;
  showDueDate: boolean;
  showProgress: boolean;
  showEffort: boolean;
  showDescription: boolean;
  columnHeight: 'auto' | 'fixed';
};

export type ColumnEditingValues = {
  name: string;
  wip: string;
  backlogReviewAfter: string;
  backlogReviewEvery: string;
  backlogArchiveAfter: string;
  doneArchiveAfter: string;
  submitting: boolean;
  error: string | null;
};
