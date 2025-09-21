import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Alice Rivera' })
  displayName?: string;

  @ApiPropertyOptional({ example: 'fr-FR' })
  locale?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ example: 'Product owner at Stratum', nullable: true })
  bio?: string | null;
}
