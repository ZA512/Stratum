import { ApiProperty } from '@nestjs/swagger';

export class LogoutDto {
  @ApiProperty({ example: 'refresh-token-string' })
  refreshToken!: string;
}
