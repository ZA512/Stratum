import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChildNodeDto {
  @ApiProperty({ example: 'Implement login flow' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Detail des etapes', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string | null;

  @ApiPropertyOptional({ example: '2025-03-01T10:00:00.000Z', nullable: true })
  @IsOptional()
  @IsString()
  dueAt?: string | null;
}
