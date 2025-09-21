import { ApiProperty } from '@nestjs/swagger';

export class NodeBreadcrumbItemDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  @ApiProperty({ example: 'SIMPLE', enum: ['SIMPLE', 'MEDIUM', 'COMPLEX'] })
  type!: string;

  @ApiProperty({ example: 1 })
  depth!: number;

  @ApiProperty({ example: 'board_root', nullable: true })
  boardId!: string | null;
}
