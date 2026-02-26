import { ApiProperty } from '@nestjs/swagger';

export class RequestResetDto {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;
}
