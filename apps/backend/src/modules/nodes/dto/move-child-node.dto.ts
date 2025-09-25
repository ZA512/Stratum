import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class MoveChildNodeDto {
  @ApiProperty({ example: 'column_backlog' })
  @IsString()
  targetColumnId!: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
