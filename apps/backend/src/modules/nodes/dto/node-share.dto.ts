import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ColumnBehaviorKey } from '@prisma/client';

export class NodeShareViaDto {
  @ApiProperty({ example: 'node_parent' })
  nodeId!: string;

  @ApiProperty({ example: 'Projet parent' })
  title!: string;
}

export class NodeShareCollaboratorDto {
  @ApiProperty({ example: 'user_123' })
  userId!: string;

  @ApiProperty({ example: 'Alice Martin' })
  displayName!: string;

  @ApiProperty({ example: 'alice@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'https://cdn/avatar.png', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({
    enum: ['OWNER', 'DIRECT', 'INHERITED', 'SELF'],
    example: 'DIRECT',
  })
  accessType!: 'OWNER' | 'DIRECT' | 'INHERITED' | 'SELF';

  @ApiProperty({ type: NodeShareViaDto, isArray: true })
  viaNodes!: NodeShareViaDto[];

  @ApiPropertyOptional({ example: '2025-01-04T10:00:00.000Z', nullable: true })
  addedAt!: string | null;

  @ApiPropertyOptional({ example: 'user_admin', nullable: true })
  addedById!: string | null;
}

export class NodeShareInvitationDto {
  @ApiProperty({ example: 'guest@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: '2025-01-05T09:00:00.000Z', nullable: true })
  invitedAt!: string | null;

  @ApiPropertyOptional({ example: 'user_admin', nullable: true })
  invitedById!: string | null;

  @ApiProperty({
    enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
    example: 'PENDING',
  })
  status!: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
}

export class NodeShareSummaryDto {
  @ApiProperty({ example: 'node_abc' })
  nodeId!: string;

  @ApiProperty({ type: NodeShareCollaboratorDto, isArray: true })
  collaborators!: NodeShareCollaboratorDto[];

  @ApiProperty({ type: NodeShareInvitationDto, isArray: true })
  invitations!: NodeShareInvitationDto[];
}

export class InviteNodeCollaboratorDto {
  @ApiProperty({ example: 'invitee@example.com' })
  email!: string;
}

export class NodeShareIncomingInvitationDto {
  @ApiProperty({ example: 'invite_123' })
  id!: string;

  @ApiProperty({ example: 'node_abc' })
  nodeId!: string;

  @ApiProperty({ example: 'Planifier la roadmap Q4' })
  nodeTitle!: string;

  @ApiProperty({ example: 'team_456' })
  teamId!: string;

  @ApiProperty({ example: 'user_owner' })
  inviterId!: string;

  @ApiProperty({ example: 'Alice Martin' })
  inviterDisplayName!: string;

  @ApiProperty({ example: 'alice@example.com' })
  inviterEmail!: string;

  @ApiProperty({ example: '2025-01-05T09:00:00.000Z' })
  invitedAt!: string;

  @ApiProperty({ example: '2025-02-04T09:00:00.000Z' })
  expiresAt!: string;

  @ApiProperty({
    enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
    example: 'PENDING',
  })
  status!: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
}

export class NodeShareInvitationActionResultDto {
  @ApiProperty({ example: 'invite_123' })
  id!: string;

  @ApiProperty({ example: 'node_abc' })
  nodeId!: string;

  @ApiProperty({ example: 'Planifier la roadmap Q4' })
  nodeTitle!: string;

  @ApiProperty({ example: 'team_456' })
  teamId!: string;

  @ApiPropertyOptional({ example: 'board_123' })
  boardId?: string;

  @ApiPropertyOptional({ example: 'column_789' })
  columnId?: string;

  @ApiPropertyOptional({ enum: ColumnBehaviorKey, example: 'BACKLOG' })
  columnBehaviorKey?: ColumnBehaviorKey;

  @ApiProperty({ example: 'PENDING' })
  previousStatus!: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

  @ApiProperty({
    enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
    example: 'ACCEPTED',
  })
  status!: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

  @ApiProperty({ example: '2025-01-06T12:34:56.000Z' })
  respondedAt!: string;
}
