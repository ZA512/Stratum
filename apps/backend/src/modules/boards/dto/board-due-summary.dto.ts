import { ApiProperty } from '@nestjs/swagger';

export class BoardDueSummaryDto {
  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 5 })
  overdue: number;

  @ApiProperty({ example: 7 })
  dueSoon: number;

  @ApiProperty({ example: 0 })
  rangeDays: number;

  @ApiProperty({ example: '2026-02-11T09:00:00.000Z' })
  generatedAt: string;
}