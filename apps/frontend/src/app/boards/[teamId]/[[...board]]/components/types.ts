import type { BoardNode, BoardColumn } from '@/features/boards/boards-api';

// UI-enriched type if needed later (currently identical pass-through)
export interface BoardColumnWithNodes extends BoardColumn {
  nodes?: BoardNode[];
}
