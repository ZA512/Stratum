import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuickNoteType } from '@prisma/client';

export class CreateQuickNoteDto {
  @ApiProperty({ example: 'Relancer Marc budget' })
  text!: string;

  @ApiProperty({ enum: QuickNoteType, example: QuickNoteType.NOTE })
  type!: QuickNoteType;

  @ApiPropertyOptional({ example: 'board_123', nullable: true })
  kanbanId?: string | null;
}
