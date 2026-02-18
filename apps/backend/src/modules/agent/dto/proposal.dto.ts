import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/* ── Validate ── */

export class ValidateProposalDto {
  @ApiPropertyOptional({
    description:
      "Numéro d'alternative sélectionnée (défaut 1 si une seule proposition)",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  selectedAlternativeNo?: number;
}

/* ── Approve ── */

export class ApproveProposalDto {
  @ApiPropertyOptional({
    description: "Numéro d'alternative approuvée (doit correspondre à la sélection)",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  selectedAlternativeNo?: number;
}

/* ── Reject ── */

export class RejectProposalDto {
  @ApiProperty({ description: 'Raison du refus' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

/* ── Apply ── */

export class ApplyProposalDto {
  @ApiPropertyOptional({
    description:
      'Version attendue du workspace pour détection de conflits (optimistic locking)',
  })
  @IsOptional()
  @IsString()
  expectedVersion?: string;
}

/* ── Rollback ── */

export class RollbackProposalDto {
  @ApiPropertyOptional({ description: 'Raison du rollback' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/* ── Réponses ── */

export class ProposalStateResponseDto {
  @ApiProperty() proposalId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() selectedAlternativeNo?: number | null;
  @ApiPropertyOptional() appliedAt?: Date | null;
  @ApiPropertyOptional() rejectedAt?: Date | null;
  @ApiPropertyOptional() rejectionReason?: string | null;
}
