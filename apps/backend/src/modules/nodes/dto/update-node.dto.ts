import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNodeDto {
  @ApiPropertyOptional({ example: 'Nouveau titre', maxLength: 200 })
  title?: string;

  @ApiPropertyOptional({ example: 'Description mise a jour', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ example: '2025-02-01T10:00:00.000Z', nullable: true })
  dueAt?: string | null;

  @ApiPropertyOptional({ example: 55, description: 'Progression en pourcentage (0-100)' })
  progress?: number;

  @ApiPropertyOptional({ example: ['attente@exemple.com','support@exemple.com'], description: 'Emails à relancer automatiquement (si bloqué)' })
  blockedReminderEmails?: string[];

  @ApiPropertyOptional({ example: 5, description: 'Intervalle (jours) entre relances automatiques si bloqué', nullable: true })
  blockedReminderIntervalDays?: number | null;

  @ApiPropertyOptional({ example: '2025-02-15T00:00:00.000Z', description: 'Date estimée de fin de blocage', nullable: true })
  blockedExpectedUnblockAt?: string | null;

  @ApiPropertyOptional({ example: 'HIGH', enum: ['NONE','CRITICAL','HIGH','MEDIUM','LOW','LOWEST'] })
  priority?: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';

  @ApiPropertyOptional({ example: 'S', enum: ['UNDER2MIN','XS','S','M','L','XL','XXL'], nullable: true })
  effort?: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;

  @ApiPropertyOptional({ example: ['infra','urgent'], description: 'Liste de tags (1-32 chars), max 20', isArray: true })
  tags?: string[];
}
