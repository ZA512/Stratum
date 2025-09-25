import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChecklistItemDto {
  @ApiProperty({ example: 'Verifier la QA', maxLength: 500 })
  content!: string;

  @ApiPropertyOptional({ example: 2, description: 'Position cible (0-based)' })
  position?: number;
}
