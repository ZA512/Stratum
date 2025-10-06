import { ApiProperty } from '@nestjs/swagger';

// --- Classes de support d'abord pour éviter toute ReferenceError dans les décorateurs ---

export class NodeRaciDto {
  @ApiProperty({ type: [String], description: 'IDs responsables (R)' })
  responsibleIds!: string[];

  @ApiProperty({ type: [String], description: 'IDs accountable (A)' })
  accountableIds!: string[];

  @ApiProperty({ type: [String], description: 'IDs consultés (C)' })
  consultedIds!: string[];

  @ApiProperty({ type: [String], description: 'IDs informés (I)' })
  informedIds!: string[];
}

export class NodeTimeTrackingDto {
  @ApiProperty({
    example: 12,
    nullable: true,
    description: 'Temps estimé (heures)',
  })
  estimatedTimeHours!: number | null;

  @ApiProperty({
    example: 8,
    nullable: true,
    description: 'Temps réel OPEX (heures)',
  })
  actualOpexHours!: number | null;

  @ApiProperty({
    example: 4,
    nullable: true,
    description: 'Temps réel CAPEX (heures)',
  })
  actualCapexHours!: number | null;

  @ApiProperty({ example: '2025-03-01', nullable: true })
  plannedStartDate!: string | null;

  @ApiProperty({ example: '2025-03-15', nullable: true })
  plannedEndDate!: string | null;

  @ApiProperty({ example: '2025-03-18', nullable: true })
  actualEndDate!: string | null;
}

export class NodeFinancialDto {
  @ApiProperty({
    example: 'TO_BILL',
    enum: ['TO_BILL', 'BILLED', 'PAID'],
    nullable: true,
  })
  billingStatus!: 'TO_BILL' | 'BILLED' | 'PAID' | null;

  @ApiProperty({ example: 75, nullable: true, description: 'Taux horaire (€)' })
  hourlyRate!: number | null;

  @ApiProperty({
    example: 900,
    nullable: true,
    description: 'Budget prévu (€)',
  })
  plannedBudget!: number | null;

  @ApiProperty({
    example: 450,
    nullable: true,
    description: 'Budget consommé en valeur (€)',
  })
  consumedBudgetValue!: number | null;

  @ApiProperty({
    example: 50,
    nullable: true,
    description: 'Budget consommé (%)',
  })
  consumedBudgetPercent!: number | null;

  @ApiProperty({
    example: 900,
    nullable: true,
    description: 'Coût réel calculé (€)',
  })
  actualCost!: number | null;
}

// --- DTO principal après les dépendances ---

export class NodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 44 })
  shortId!: number;

  @ApiProperty({ example: 'team_demo' })
  teamId!: string;

  @ApiProperty({ example: null, nullable: true })
  parentId!: string | null;

  // Champ 'type' supprimé (legacy)

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  @ApiProperty({ example: 'Design OAuth sequence' })
  description?: string | null;

  @ApiProperty({ example: 'node_root/node_123' })
  path!: string;

  @ApiProperty({ example: 1 })
  depth!: number;

  @ApiProperty({ example: 'col_progress', nullable: true })
  columnId!: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z', nullable: true })
  dueAt?: string | null;

  @ApiProperty({
    example: { checklistCompleted: 2, checklistTotal: 5 },
    nullable: true,
  })
  statusMetadata?: Record<string, unknown> | null;

  @ApiProperty({ example: 40 })
  progress!: number; // 0-100

  @ApiProperty({ example: 'En attente validation budget', nullable: true })
  blockedReason!: string | null;

  @ApiProperty({ example: ['personne@example.com'], isArray: true })
  blockedReminderEmails!: string[];

  @ApiProperty({ example: 3, nullable: true })
  blockedReminderIntervalDays!: number | null;

  @ApiProperty({ example: '2025-02-05T09:00:00.000Z', nullable: true })
  blockedReminderLastSentAt!: string | null;

  @ApiProperty({ example: '2025-02-10T10:00:00.000Z', nullable: true })
  blockedExpectedUnblockAt!: string | null;

  @ApiProperty({ example: '2025-01-20T09:00:00.000Z', nullable: true })
  blockedSince!: string | null;

  @ApiProperty({ example: false })
  isBlockResolved!: boolean;

  @ApiProperty({ example: '2025-02-10T00:00:00.000Z', nullable: true })
  backlogHiddenUntil!: string | null;

  @ApiProperty({ example: '2025-02-17T00:00:00.000Z', nullable: true })
  backlogNextReviewAt!: string | null;

  @ApiProperty({ example: '2025-01-31T00:00:00.000Z', nullable: true })
  backlogReviewStartedAt!: string | null;

  @ApiProperty({ example: '2025-02-02T00:00:00.000Z', nullable: true })
  backlogLastInteractionAt!: string | null;

  @ApiProperty({ example: '2025-02-09T00:00:00.000Z', nullable: true })
  backlogLastReminderAt!: string | null;

  @ApiProperty({ example: 'column_backlog', nullable: true })
  lastKnownColumnId!: string | null;

  @ApiProperty({
    example: 'BACKLOG',
    enum: ['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CUSTOM'],
    nullable: true,
  })
  lastKnownColumnBehavior!: 'BACKLOG' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CUSTOM' | null;

  @ApiProperty({ example: '2025-03-15T00:00:00.000Z', nullable: true })
  doneArchiveScheduledAt!: string | null;

  @ApiProperty({
    example: 'HIGH',
    enum: ['NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'],
  })
  priority!: 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';

  @ApiProperty({
    example: 'S',
    enum: ['UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    nullable: true,
  })
  effort!: 'UNDER2MIN' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;

  @ApiProperty({ example: ['infra', 'urgent'], isArray: true })
  tags!: string[];

  @ApiProperty({
    type: () => NodeRaciDto,
    description: 'Répartition RACI (listes d’IDs utilisateurs par rôle)',
  })
  raci!: NodeRaciDto;

  @ApiProperty({
    type: () => NodeTimeTrackingDto,
    required: false,
    description: 'Informations temps & effort',
  })
  timeTracking?: NodeTimeTrackingDto;

  @ApiProperty({
    type: () => NodeFinancialDto,
    required: false,
    description: 'Informations financières associées',
  })
  financials?: NodeFinancialDto;
}
