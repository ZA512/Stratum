import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED'], example: 'PENDING' })
  status!: 'PENDING' | 'ACCEPTED';
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
