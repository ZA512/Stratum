import { ApiProperty } from '@nestjs/swagger';

export class NodeSummaryCountsOnlyDto {
  @ApiProperty({ example: 4 }) backlog!: number;
  @ApiProperty({ example: 1 }) inProgress!: number;
  @ApiProperty({ example: 0 }) blocked!: number;
  @ApiProperty({ example: 2 }) done!: number;
}

export class NodeSummaryOnlyDto {
  @ApiProperty({ example: 'node_123' }) id!: string;
  @ApiProperty({ example: true }) hasBoard!: boolean;
  @ApiProperty({ type: NodeSummaryCountsOnlyDto })
  counts!: NodeSummaryCountsOnlyDto;
}
