import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChildNodeDto {
  @ApiPropertyOptional({ example: 'Nouveau titre', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({ example: 'Nouvelle description', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string | null;

  @ApiPropertyOptional({ example: '2025-04-01T10:00:00.000Z', nullable: true })
  @IsOptional()
  @IsString()
  dueAt?: string | null;
}
