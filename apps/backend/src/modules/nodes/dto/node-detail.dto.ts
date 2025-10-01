import { ApiProperty } from '@nestjs/swagger';
import { NodeDto } from './node.dto';
import { NodeCommentDto } from './node-comment.dto';

export class NodeAssignmentDto {
  @ApiProperty({ example: 'assign_1' })
  id!: string;

  @ApiProperty({ example: 'user_alice' })
  userId!: string;

  @ApiProperty({ example: 'Owner', nullable: true })
  role!: string | null;

  @ApiProperty({ example: 'Alice Martin', required: false })
  displayName?: string;

  @ApiProperty({
    example: 'https://cdn/avatar.png',
    nullable: true,
    required: false,
  })
  avatarUrl?: string | null;
}

export class NodeMinimalChildDto {
  @ApiProperty({ example: 'node_child' })
  id!: string;

  // type supprimé (legacy)

  @ApiProperty({ example: 'Synchro marketing' })
  title!: string;

  @ApiProperty({
    example: 'BACKLOG',
    enum: ['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'DONE'],
    required: false,
  })
  behaviorKey?: string;

  @ApiProperty({ example: 'column_abc', nullable: true })
  columnId?: string | null;
}

export class NodeSummaryCountsDto {
  @ApiProperty({ example: 4 })
  backlog!: number;

  @ApiProperty({ example: 1 })
  inProgress!: number;

  @ApiProperty({ example: 0 })
  blocked!: number;

  @ApiProperty({ example: 8 })
  done!: number;
}

export class NodeSummaryDto {
  @ApiProperty({ type: NodeSummaryCountsDto })
  counts!: NodeSummaryCountsDto;
}

export class NodeDetailDto extends NodeDto {
  @ApiProperty({ type: NodeAssignmentDto, isArray: true })
  assignments!: NodeAssignmentDto[];

  @ApiProperty({ type: NodeMinimalChildDto, isArray: true })
  children!: NodeMinimalChildDto[];

  @ApiProperty({ type: NodeSummaryDto, required: false })
  summary?: NodeSummaryDto;

  @ApiProperty({
    required: false,
    example: {
      id: 'board_123',
      columns: [
        { id: 'col_1', behaviorKey: 'BACKLOG' },
        { id: 'col_2', behaviorKey: 'DONE' },
      ],
    },
  })
  board?: { id: string; columns: { id: string; behaviorKey: string | null }[] };

  @ApiProperty({ type: NodeCommentDto, isArray: true })
  comments!: NodeCommentDto[];
}
