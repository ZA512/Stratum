import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConvertNodeDto {
  @ApiProperty({ enum: ['SIMPLE', 'MEDIUM', 'COMPLEX'], example: 'COMPLEX' })
  targetType!: 'SIMPLE' | 'MEDIUM' | 'COMPLEX';

  @ApiPropertyOptional({ type: [String], example: ['Checklist item'] })
  checklistItems?: string[];
}
