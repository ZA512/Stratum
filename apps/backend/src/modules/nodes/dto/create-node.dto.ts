import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNodeDto {
  @ApiProperty({ example: 'Implement OAuth flow' })
  title!: string;

  @ApiProperty({ example: 'column_in_progress' })
  columnId!: string;

  @ApiPropertyOptional({ example: 'node_stratum_root', nullable: true })
  parentId?: string | null;

  @ApiPropertyOptional({ example: 'Detail the OAuth steps', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ example: '2025-01-01T12:00:00.000Z', nullable: true })
  dueAt?: string | null;

  // Champ 'type' supprimé (legacy non supporté)
}
