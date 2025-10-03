import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: "Email de l'utilisateur",
    example: 'alice@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Mot de passe (minimum 6 caractères)',
    example: 'motdepasse123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    description: "Nom d'affichage de l'utilisateur",
    example: 'Alice Dupont',
    required: false,
  })
  @IsOptional()
  @IsString()
  displayName?: string;
}
