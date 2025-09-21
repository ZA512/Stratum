import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token' })
  token!: string;

  @ApiProperty({ example: 'NewPassword123!' })
  password!: string;
}
