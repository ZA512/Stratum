import { ApiProperty } from '@nestjs/swagger';

export class NodeDeletePreviewDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: true })
  hasChildren!: boolean;

  @ApiProperty({ example: 5 })
  directChildren!: number;

  @ApiProperty({ example: 12 })
  totalDescendants!: number;

  @ApiProperty({
    example: {
      backlog: 3,
      inProgress: 4,
      blocked: 2,
      done: 3,
    },
  })
  counts!: {
    backlog: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
}
