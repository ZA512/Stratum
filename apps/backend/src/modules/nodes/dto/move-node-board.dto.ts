import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MoveNodeBoardDto {
  @ApiProperty({ example: 'board_target' })
  @IsString()
  targetBoardId!: string;

  @ApiProperty({ example: 'column_target' })
  @IsString()
  targetColumnId!: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
