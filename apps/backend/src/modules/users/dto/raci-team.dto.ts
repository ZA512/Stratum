import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class RaciTeamRolesDto {
  @ApiProperty({
    type: [String],
    description: 'Identifiants des membres Responsable (R)',
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  R: string[] = [];

  @ApiProperty({
    type: [String],
    description: 'Identifiants des membres Approbateur (A)',
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  A: string[] = [];

  @ApiProperty({
    type: [String],
    description: 'Identifiants des membres Consulté (C)',
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  C: string[] = [];

  @ApiProperty({
    type: [String],
    description: 'Identifiants des membres Informé (I)',
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  I: string[] = [];
}

export class CreateRaciTeamDto {
  @ApiProperty({ description: "Nom lisible de l'équipe RACI" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Répartition RACI à enregistrer',
    type: () => RaciTeamRolesDto,
  })
  @ValidateNested()
  @Type(() => RaciTeamRolesDto)
  raci!: RaciTeamRolesDto;
}

export class UpdateRaciTeamDto {
  @ApiProperty({ description: "Nouveau nom de l'équipe RACI" })
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export type RaciTeamRoles = {
  R: string[];
  A: string[];
  C: string[];
  I: string[];
};
