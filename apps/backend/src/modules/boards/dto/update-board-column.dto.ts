import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBoardColumnDto {
  @ApiPropertyOptional({ example: 'Ready for QA' })
  name?: string;

  @ApiPropertyOptional({ example: 2, nullable: true })
  wipLimit?: number | null;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  position?: number;
}
