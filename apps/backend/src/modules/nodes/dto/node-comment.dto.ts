import { ApiProperty } from '@nestjs/swagger';

export class NodeCommentNotificationDto {
  @ApiProperty({ example: true })
  responsible!: boolean;

  @ApiProperty({ example: true })
  accountable!: boolean;

  @ApiProperty({ example: true })
  consulted!: boolean;

  @ApiProperty({ example: true })
  informed!: boolean;

  @ApiProperty({ example: false })
  project!: boolean;

  @ApiProperty({ example: false })
  subProject!: boolean;
}

export class NodeCommentMentionDto {
  @ApiProperty({ example: 'user_123' })
  userId!: string;

  @ApiProperty({ example: 'Alice Martin' })
  displayName!: string;

  @ApiProperty({ example: 'alice@example.com' })
  email!: string;
}

export class NodeCommentAuthorDto {
  @ApiProperty({ example: 'user_456' })
  id!: string;

  @ApiProperty({ example: 'Jean Dupont' })
  displayName!: string;

  @ApiProperty({ example: 'https://cdn/avatar.png', nullable: true })
  avatarUrl!: string | null;
}

export class NodeCommentDto {
  @ApiProperty({ example: 'comment_123' })
  id!: string;

  @ApiProperty({ example: 'node_123' })
  nodeId!: string;

  @ApiProperty({ type: () => NodeCommentAuthorDto })
  author!: NodeCommentAuthorDto;

  @ApiProperty({
    example: 'Nouveau commentaire',
    description: 'Contenu texte brut du commentaire',
  })
  body!: string;

  @ApiProperty({ example: '2024-05-01T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ type: () => NodeCommentNotificationDto })
  notify!: NodeCommentNotificationDto;

  @ApiProperty({ type: () => NodeCommentMentionDto, isArray: true })
  mentions!: NodeCommentMentionDto[];
}

export class CreateNodeCommentDto {
  @ApiProperty({ example: 'Voici les dernières nouvelles', minLength: 1 })
  body!: string;

  @ApiProperty({ example: true, required: false })
  notifyResponsible?: boolean;

  @ApiProperty({ example: true, required: false })
  notifyAccountable?: boolean;

  @ApiProperty({ example: true, required: false })
  notifyConsulted?: boolean;

  @ApiProperty({ example: true, required: false })
  notifyInformed?: boolean;

  @ApiProperty({ example: false, required: false })
  notifyProject?: boolean;

  @ApiProperty({ example: false, required: false })
  notifySubProject?: boolean;

  @ApiProperty({ type: [String], required: false })
  mentions?: string[];
}
