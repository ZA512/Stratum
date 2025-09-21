import { ApiProperty } from '@nestjs/swagger';

export class TeamDto {
  @ApiProperty({ example: 'team_123' })
  id!: string;

  @ApiProperty({ example: 'Platform Squad' })
  name!: string;

  @ApiProperty({ example: 'platform-squad', nullable: true })
  slug?: string | null;

  @ApiProperty({ example: 8 })
  membersCount!: number;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: string;
}
