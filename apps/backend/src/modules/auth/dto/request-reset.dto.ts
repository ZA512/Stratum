import { ApiProperty } from '@nestjs/swagger';

export class RequestResetDto {
  @ApiProperty({ example: 'alice@stratum.dev' })
  email!: string;
}
