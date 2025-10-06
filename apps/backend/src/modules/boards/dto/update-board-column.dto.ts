import { ApiPropertyOptional } from '@nestjs/swagger';

class UpdateBacklogColumnSettingsDto {
  @ApiPropertyOptional({ example: 14, minimum: 1, maximum: 365 })
  reviewAfterDays?: number;

  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 365 })
  reviewEveryDays?: number;

  @ApiPropertyOptional({ example: 60, minimum: 1, maximum: 730 })
  archiveAfterDays?: number;
}

class UpdateDoneColumnSettingsDto {
  @ApiPropertyOptional({ example: 30, minimum: 0, maximum: 730 })
  archiveAfterDays?: number;
}

export class UpdateBoardColumnDto {
  @ApiPropertyOptional({ example: 'Ready for QA' })
  name?: string;

  @ApiPropertyOptional({ example: 2, nullable: true })
  wipLimit?: number | null;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  position?: number;

  @ApiPropertyOptional({
    description:
      'Paramètres de revue/archivage spécifiques aux colonnes Backlog',
    type: () => UpdateBacklogColumnSettingsDto,
  })
  backlogSettings?: UpdateBacklogColumnSettingsDto;

  @ApiPropertyOptional({
    description: 'Paramètres d’archivage spécifiques aux colonnes Terminé',
    type: () => UpdateDoneColumnSettingsDto,
  })
  doneSettings?: UpdateDoneColumnSettingsDto;
}
