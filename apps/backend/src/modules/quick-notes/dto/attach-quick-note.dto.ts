import { ApiPropertyOptional } from '@nestjs/swagger';

export class AttachQuickNoteDto {
  @ApiPropertyOptional({ example: 'board_123', nullable: true })
  kanbanId?: string | null;
}
