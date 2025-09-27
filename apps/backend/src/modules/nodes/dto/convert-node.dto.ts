import { ApiProperty } from '@nestjs/swagger';

export class ConvertNodeDto {
  @ApiProperty({ enum: ['SIMPLE', 'COMPLEX'], example: 'COMPLEX' })
  targetType!: 'SIMPLE' | 'COMPLEX';
}
