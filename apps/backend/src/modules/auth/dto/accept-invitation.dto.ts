import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptInvitationDto {
  @ApiProperty({ example: 'invitation-token' })
  token!: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  password!: string;

  @ApiPropertyOptional({ example: 'Bob Martin' })
  displayName?: string;
}
