import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNodeDto {
  @ApiPropertyOptional({ example: 'Nouveau titre', maxLength: 200 })
  title?: string;

  @ApiPropertyOptional({ example: 'Description mise a jour', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ example: '2025-02-01T10:00:00.000Z', nullable: true })
  dueAt?: string | null;

  @ApiPropertyOptional({
    example: 55,
    description: 'Progression en pourcentage (0-100)',
  })
  progress?: number;

  @ApiPropertyOptional({
    example: 'En attente de validation du budget par la direction financière',
    description: 'Description de ce qui est attendu pour débloquer la tâche',
    nullable: true,
  })
  blockedReason?: string | null;

  @ApiPropertyOptional({
    example: ['attente@exemple.com', 'support@exemple.com'],
    description: 'Emails à relancer automatiquement (si bloqué)',
  })
  blockedReminderEmails?: string[];

  @ApiPropertyOptional({
    example: 5,
    description: 'Intervalle (jours) entre relances automatiques si bloqué',
    nullable: true,
  })
  blockedReminderIntervalDays?: number | null;

  @ApiPropertyOptional({
    example: '2025-02-15T00:00:00.000Z',
    description: 'Date estimée de fin de blocage',
    nullable: true,
  })
  blockedExpectedUnblockAt?: string | null;

  @ApiPropertyOptional({
    example: '2025-01-20T09:00:00.000Z',
    description: "Date d'entrée dans le statut bloqué (auto-set)",
    nullable: true,
  })
  blockedSince?: string | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Indique si le blocage est résolu (arrête les relances)',
  })
  isBlockResolved?: boolean;

  @ApiPropertyOptional({
    example: 'HIGH',
    enum: ['NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'],
  })
  priority?: 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';

  @ApiPropertyOptional({
    example: 'S',
    enum: ['UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    nullable: true,
  })
  effort?: 'UNDER2MIN' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;

  @ApiPropertyOptional({
    example: ['infra', 'urgent'],
    description: 'Liste de tags (1-32 chars), max 20',
    isArray: true,
  })
  tags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs des responsables (R) pour la matrice RACI',
  })
  raciResponsibleIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs des Accountable (A) pour la matrice RACI',
  })
  raciAccountableIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs des Consulted (C) pour la matrice RACI',
  })
  raciConsultedIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs des Informed (I) pour la matrice RACI',
  })
  raciInformedIds?: string[];

  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'Temps estimé (heures)',
  })
  estimatedTimeHours?: number | null;

  @ApiPropertyOptional({
    example: 8,
    nullable: true,
    description: 'Temps réel OPEX (heures)',
  })
  actualOpexHours?: number | null;

  @ApiPropertyOptional({
    example: 4,
    nullable: true,
    description: 'Temps réel CAPEX (heures)',
  })
  actualCapexHours?: number | null;

  @ApiPropertyOptional({
    example: '2025-03-01',
    nullable: true,
    description: 'Date de début prévue (YYYY-MM-DD)',
  })
  plannedStartDate?: string | null;

  @ApiPropertyOptional({
    example: '2025-03-15',
    nullable: true,
    description: 'Date de fin prévue (YYYY-MM-DD)',
  })
  plannedEndDate?: string | null;

  @ApiPropertyOptional({
    example: '2025-03-18',
    nullable: true,
    description: 'Date de fin réelle (YYYY-MM-DD)',
  })
  actualEndDate?: string | null;

  @ApiPropertyOptional({
    example: 'TO_BILL',
    enum: ['TO_BILL', 'BILLED', 'PAID'],
    nullable: true,
    description: 'Statut de facturation',
  })
  billingStatus?: 'TO_BILL' | 'BILLED' | 'PAID' | null;

  @ApiPropertyOptional({
    example: 75,
    nullable: true,
    description: 'Taux horaire appliqué (€)',
  })
  hourlyRate?: number | null;

  @ApiPropertyOptional({
    example: 900,
    nullable: true,
    description: 'Budget prévu (€)',
  })
  plannedBudget?: number | null;

  @ApiPropertyOptional({
    example: 450,
    nullable: true,
    description: 'Budget consommé en valeur (€)',
  })
  consumedBudgetValue?: number | null;

  @ApiPropertyOptional({
    example: 50,
    nullable: true,
    description: 'Budget consommé en pourcentage (%)',
  })
  consumedBudgetPercent?: number | null;

  @ApiPropertyOptional({
    example: '2025-02-10T00:00:00.000Z',
    nullable: true,
    description: "Date jusqu'à laquelle la tâche backlog est masquée (snooze)",
  })
  backlogHiddenUntil?: string | null;

  @ApiPropertyOptional({
    example: true,
    description:
      'Force le redémarrage du cycle de revue backlog (recalcule nextReviewAt)',
  })
  backlogReviewRestart?: boolean;

  @ApiPropertyOptional({
    example: '2025-02-10T00:00:00.000Z',
    nullable: true,
    description: "Date d'archivage de la tâche (null = non archivée)",
  })
  archivedAt?: string | null;
}
