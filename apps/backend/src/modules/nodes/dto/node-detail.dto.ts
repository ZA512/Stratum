import { ApiProperty } from '@nestjs/swagger';
import { NodeDto } from './node.dto';

export class ChecklistItemDto {
  @ApiProperty({ example: 'item_1' })
  id!: string;

  @ApiProperty({ example: 'Verifier la QA' })
  content!: string;

  @ApiProperty({ example: false })
  isDone!: boolean;

  @ApiProperty({ example: 0 })
  position!: number;
}

export class ChecklistDto {
  @ApiProperty({ example: 'checklist_1' })
  id!: string;

  @ApiProperty({ example: 2 })
  progress!: number;

  @ApiProperty({ type: ChecklistItemDto, isArray: true })
  items!: ChecklistItemDto[];
}

export class NodeAssignmentDto {
  @ApiProperty({ example: 'assign_1' })
  id!: string;

  @ApiProperty({ example: 'user_alice' })
  userId!: string;

  @ApiProperty({ example: 'Owner', nullable: true })
  role!: string | null;
}

export class NodeMinimalChildDto {
  @ApiProperty({ example: 'node_child' })
  id!: string;

  @ApiProperty({ example: 'SIMPLE', enum: ['SIMPLE', 'MEDIUM', 'COMPLEX'] })
  type!: string;

  @ApiProperty({ example: 'Synchro marketing' })
  title!: string;
}

export class NodeDetailDto extends NodeDto {
  @ApiProperty({ type: NodeAssignmentDto, isArray: true })
  assignments!: NodeAssignmentDto[];

  @ApiProperty({ type: ChecklistDto, nullable: true })
  checklist!: ChecklistDto | null;

  @ApiProperty({ type: NodeMinimalChildDto, isArray: true })
  children!: NodeMinimalChildDto[];
}
