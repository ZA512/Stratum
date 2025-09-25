import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChecklistItemDto {
  @ApiPropertyOptional({ example: 'Libelle modifie', maxLength: 500 })
  content?: string;

  @ApiPropertyOptional({ example: true })
  isDone?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Nouvelle position (0-based)' })
  position?: number;
}
