import { ApiProperty } from '@nestjs/swagger';
import { BoardColumnWithNodesDto } from './board-column-with-nodes.dto';

export class BoardTreeActivityDto {
  @ApiProperty({ example: 'COMMENT' })
  type!: 'CREATION' | 'MODIFICATION' | 'COMMENT';

  @ApiProperty({ example: '2026-03-10T09:00:00.000Z' })
  createdAt!: string;
}

export class BoardTreeNodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 44 })
  shortId!: number;

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  @ApiProperty({ example: 'Synthèse UX du board', nullable: true })
  description!: string | null;

  @ApiProperty({ example: null, nullable: true })
  parentId!: string | null;

  @ApiProperty({ example: 0 })
  depth!: number;

  @ApiProperty({ example: 'board_123' })
  boardId!: string;

  @ApiProperty({ example: 'Roadmap' })
  boardName!: string;

  @ApiProperty({ example: 'column_backlog' })
  columnId!: string;

  @ApiProperty({ example: 'Backlog' })
  columnName!: string;

  @ApiProperty({ example: 'BACKLOG' })
  columnBehaviorKey!: 'BACKLOG' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CUSTOM';

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: 'board_child_123', nullable: true })
  childBoardId!: string | null;

  @ApiProperty({ example: '2026-03-10T09:00:00.000Z', nullable: true })
  dueAt!: string | null;

  @ApiProperty({ example: '2026-03-10T09:00:00.000Z', nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ example: 45, nullable: true })
  progress!: number | null;

  @ApiProperty({ example: 'HIGH', nullable: true })
  priority!: 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST' | null;

  @ApiProperty({ example: 'M', nullable: true })
  effort!: 'UNDER2MIN' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;

  @ApiProperty({ example: ['Comment body'], isArray: true })
  commentBodies!: string[];

  @ApiProperty({ example: false })
  hasRecentComment!: boolean;

  @ApiProperty({ example: '2026-03-10T09:00:00.000Z', nullable: true })
  blockedSince!: string | null;

  @ApiProperty({ example: false })
  sharedPlacementLocked!: boolean;

  @ApiProperty({ type: () => BoardTreeActivityDto, isArray: true })
  activities!: BoardTreeActivityDto[];

  @ApiProperty({ example: ['user_1'], isArray: true })
  assigneeIds!: string[];

  @ApiProperty({ example: ['Ada Lovelace'], isArray: true })
  assigneeNames!: string[];
}

export class BoardGanttDependencyDto {
  @ApiProperty({ example: 'dep_abcd' })
  id!: string;

  @ApiProperty({ example: 'task_A' })
  fromId!: string;

  @ApiProperty({ example: 'task_B' })
  toId!: string;

  @ApiProperty({ example: 'FS', enum: ['FS', 'SS', 'FF', 'SF'] })
  type!: 'FS' | 'SS' | 'FF' | 'SF';

  @ApiProperty({ example: 0 })
  lag!: number;

  @ApiProperty({ example: 'ASAP', enum: ['ASAP', 'FREE'] })
  mode!: 'ASAP' | 'FREE';

  @ApiProperty({ example: false })
  hardConstraint!: boolean;
}

export class BoardWithNodesDto {
  @ApiProperty({ example: 'board_123' })
  id!: string;

  @ApiProperty({ example: 'node_root' })
  nodeId!: string;

  @ApiProperty({ example: 'Stratum Launch' })
  name!: string;

  @ApiProperty({ type: BoardColumnWithNodesDto, isArray: true })
  columns!: BoardColumnWithNodesDto[];

  @ApiProperty({
    example: false,
    description: 'True if board has shared tasks with other users',
  })
  isShared!: boolean;

  @ApiProperty({ type: () => BoardGanttDependencyDto, isArray: true })
  dependencies!: BoardGanttDependencyDto[];

  @ApiProperty({ type: () => BoardTreeNodeDto, isArray: true })
  treeNodes!: BoardTreeNodeDto[];
}
