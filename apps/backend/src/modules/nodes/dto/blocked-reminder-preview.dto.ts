import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BlockedReminderPreviewDto {
  @ApiProperty({
    example: 'destinataire@exemple.com',
    description: 'Email du destinataire pour lequel générer l’aperçu',
  })
  recipientEmail!: string;

  @ApiPropertyOptional({
    example: 'Bonjour, pouvez-vous me confirmer le déblocage de ce point ?',
    nullable: true,
    description: 'Message de relance à injecter dans l’aperçu',
  })
  blockedReason?: string | null;

  @ApiPropertyOptional({
    example: 5,
    nullable: true,
    description: 'Cadence de relance en jours utilisée pour l’aperçu',
  })
  blockedReminderIntervalDays?: number | null;

  @ApiPropertyOptional({
    example: true,
    description: 'État actif/inactif de la relance pour l’aperçu',
  })
  blockedReminderActive?: boolean;
}

export class BlockedReminderPreviewResponseDto {
  @ApiProperty({ example: '[Stratum] Relance blocage – Carte importante' })
  subject!: string;

  @ApiProperty({ example: 'Bonjour,\n\nJe me permets de vous relancer…' })
  text!: string;

  @ApiPropertyOptional({ nullable: true })
  html!: string | null;

  @ApiProperty({ example: 'destinataire@exemple.com' })
  recipientEmail!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  recipientDisplayName!: string;

  @ApiProperty({ example: true })
  linkIncluded!: boolean;

  @ApiPropertyOptional({
    example: 'https://app.stratum/boards/team_x/board_y?task=node_123',
    nullable: true,
  })
  linkUrl!: string | null;

  @ApiProperty({ example: true })
  recipientHasAccess!: boolean;

  @ApiProperty({ example: true })
  reminderActive!: boolean;

  @ApiPropertyOptional({
    example: '2025-03-01T09:00:00.000Z',
    nullable: true,
  })
  nextReminderAt!: string | null;
}