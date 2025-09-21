import { ColumnBehaviorKey } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBoardColumnDto {
  @ApiProperty({ example: 'Design review' })
  name!: string;

  @ApiProperty({
    enum: ColumnBehaviorKey,
    example: ColumnBehaviorKey.IN_PROGRESS,
  })
  behaviorKey!: ColumnBehaviorKey;

  @ApiPropertyOptional({ example: 5, nullable: true })
  wipLimit?: number | null;
}
