import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuickNoteType } from '@prisma/client';

export class QuickNoteDto {
  @ApiProperty({ example: 'note_123' })
  id!: string;

  @ApiProperty({ example: 'Relancer Marc budget' })
  text!: string;

  @ApiProperty({ enum: QuickNoteType, example: QuickNoteType.NOTE })
  type!: QuickNoteType;

  @ApiPropertyOptional({ example: 'board_123', nullable: true })
  kanbanId!: string | null;

  @ApiPropertyOptional({ example: 'Projet Marketing', nullable: true })
  kanbanName!: string | null;

  @ApiPropertyOptional({ example: 'team_123', nullable: true })
  kanbanTeamId!: string | null;

  @ApiProperty({ example: true })
  kanbanAvailable!: boolean;

  @ApiProperty({ example: '2026-02-04T10:15:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-02-05T10:15:00.000Z', nullable: true })
  treatedAt!: string | null;
}

export class QuickNoteListDto {
  @ApiProperty({ type: QuickNoteDto, isArray: true })
  items!: QuickNoteDto[];

  @ApiProperty({ example: 3 })
  count!: number;
}

export class QuickNoteBoardDto {
  @ApiProperty({ example: 'board_123' })
  id!: string;

  @ApiProperty({ example: 'Projet Marketing' })
  name!: string;

  @ApiProperty({ example: 'team_123' })
  teamId!: string;

  @ApiProperty({ example: 'Equipe Marketing' })
  teamName!: string;
}

export class QuickNoteCleanupDto {
  @ApiProperty({ example: 5 })
  deleted!: number;
}
