import { ApiProperty } from '@nestjs/swagger';

export class TeamMemberDto {
  @ApiProperty({ example: 'user_123' })
  id!: string;

  @ApiProperty({ example: 'Alice Martin' })
  displayName!: string;

  @ApiProperty({ example: 'alice@example.com' })
  email!: string;

  @ApiProperty({ example: 'https://cdn/avatar.png', nullable: true })
  avatarUrl!: string | null;
}
