import { ApiProperty } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({ example: 'invitee@example.com' })
  email!: string;

  @ApiProperty({ example: 'team_stratum' })
  teamId!: string;
}
