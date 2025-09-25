import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class ReorderChildrenDto {
  @ApiProperty({ example: 'column_backlog' })
  @IsString()
  columnId!: string;

  @ApiProperty({ type: [String], example: ['node_a', 'node_b', 'node_c'] })
  @IsArray()
  @ArrayMinSize(1)
  orderedIds!: string[];
}
