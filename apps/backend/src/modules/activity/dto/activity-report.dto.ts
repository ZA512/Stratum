import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BoardActivityReportSummaryDto {
  @ApiProperty({ example: 42 })
  totalEvents!: number;

  @ApiProperty({ example: 3 })
  cardsCreated!: number;

  @ApiProperty({ example: 8 })
  cardsMoved!: number;

  @ApiProperty({ example: 5 })
  commentsAdded!: number;

  @ApiProperty({ example: 2 })
  descriptionsUpdated!: number;

  @ApiProperty({ example: 4 })
  dueDatesUpdated!: number;

  @ApiProperty({ example: 6 })
  progressUpdated!: number;

  @ApiProperty({ example: 1 })
  cardsArchived!: number;

  @ApiProperty({ example: 2 })
  cardsRestored!: number;
}

export class BoardActivityReportItemDto {
  @ApiProperty({ example: 'evt_123' })
  id!: string;

  @ApiProperty({ example: '2026-03-18T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: 'COMMENT_ADDED' })
  eventType!: string;

  @ApiProperty({ example: 'Commentaire ajoute sur Preparer devis' })
  summary!: string;

  @ApiPropertyOptional({ example: 'user_123', nullable: true })
  actorId!: string | null;

  @ApiPropertyOptional({ example: 'Alice Dupont', nullable: true })
  actorDisplayName!: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg', nullable: true })
  actorAvatarUrl!: string | null;

  @ApiProperty({ example: 'board_123' })
  boardId!: string;

  @ApiProperty({ example: 'Projet A' })
  boardName!: string;

  @ApiProperty({ example: 'node_123' })
  nodeId!: string;

  @ApiPropertyOptional({ example: 45, nullable: true })
  nodeShortId!: number | null;

  @ApiProperty({ example: 'Preparer devis' })
  nodeTitle!: string;

  @ApiPropertyOptional({ example: 'node_parent', nullable: true })
  parentNodeId!: string | null;

  @ApiPropertyOptional({ example: 'col_1', nullable: true })
  columnId!: string | null;

  @ApiPropertyOptional({ example: 'Backlog', nullable: true })
  columnName!: string | null;

  @ApiPropertyOptional({ example: 'description', nullable: true })
  fieldKey!: string | null;

  @ApiPropertyOptional({ example: 'ancienne valeur', nullable: true })
  oldValue!: string | null;

  @ApiPropertyOptional({ example: 'nouvelle valeur', nullable: true })
  newValue!: string | null;

  @ApiPropertyOptional({ example: 'Texte du commentaire', nullable: true })
  commentBody!: string | null;

  @ApiPropertyOptional({ example: 'Texte du commentaire', nullable: true })
  commentPreview!: string | null;

  @ApiPropertyOptional({ type: Object })
  payload!: Record<string, unknown> | null;
}

export class BoardActivityReportResponseDto {
  @ApiProperty({ example: 'board_123' })
  boardId!: string;

  @ApiProperty({ example: 'Projet A' })
  boardName!: string;

  @ApiProperty({ example: '2026-03-11T00:00:00.000Z' })
  from!: string;

  @ApiProperty({ example: '2026-03-18T23:59:59.999Z' })
  to!: string;

  @ApiProperty({ example: '2026-03-18T09:30:00.000Z' })
  generatedAt!: string;

  @ApiProperty({ type: BoardActivityReportSummaryDto })
  summary!: BoardActivityReportSummaryDto;

  @ApiProperty({ type: BoardActivityReportItemDto, isArray: true })
  items!: BoardActivityReportItemDto[];
}