import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventActorType,
  EventSource,
  Prisma,
  ProposalStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApplyProposalDto,
  ApproveProposalDto,
  ProposalStateResponseDto,
  RejectProposalDto,
  RollbackProposalDto,
  ValidateProposalDto,
} from './dto/proposal.dto';
import { evaluateConfidence } from './confidence-gating';
import { BusinessRuleEngine } from './rules';

/**
 * Proposal Engine – Machine d'etats:
 *   DRAFT -> VALIDATED -> APPROVED -> APPLIED
 *   DRAFT/VALIDATED/APPROVED -> REJECTED
 *   APPLIED -> ROLLED_BACK
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: BusinessRuleEngine,
  ) {}

  /* ── Transitions autorisées ── */
  private static readonly TRANSITIONS: Record<string, ProposalStatus[]> = {
    [ProposalStatus.DRAFT]: [ProposalStatus.VALIDATED, ProposalStatus.REJECTED],
    [ProposalStatus.VALIDATED]: [
      ProposalStatus.APPROVED,
      ProposalStatus.REJECTED,
    ],
    [ProposalStatus.APPROVED]: [
      ProposalStatus.APPLIED,
      ProposalStatus.REJECTED,
    ],
    [ProposalStatus.APPLIED]: [ProposalStatus.ROLLED_BACK],
    [ProposalStatus.REJECTED]: [],
    [ProposalStatus.ROLLED_BACK]: [],
  };

  /* ── GET (lecture) ── */

  async getProposal(
    workspaceId: string,
    proposalId: string,
  ): Promise<ProposalStateResponseDto> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id: proposalId, workspaceId },
      select: {
        id: true,
        status: true,
        selectedAlternativeNo: true,
        appliedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        workspaceId: true,
        intent: true,
        confidenceScore: true,
        actions: {
          orderBy: { actionOrder: 'asc' },
          select: {
            id: true,
            actionType: true,
            targetEntityType: true,
            targetEntityId: true,
            actionOrder: true,
            payload: true,
          },
        },
        explanation: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!proposal) throw new NotFoundException('Proposal introuvable');
    return this.toProposalStateResponse(proposal, workspaceId);
  }

  /* ── VALIDATE ── */

  async validate(
    workspaceId: string,
    proposalId: string,
    userId: string,
    dto: ValidateProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.transition(
      workspaceId,
      proposalId,
      userId,
      ProposalStatus.VALIDATED,
      'PROPOSAL_VALIDATED',
      (proposal) => ({
        selectedAlternativeNo: dto.selectedAlternativeNo ?? proposal.selectedAlternativeNo ?? 1,
      }),
    );
  }

  /* ── APPROVE ── */

  async approve(
    workspaceId: string,
    proposalId: string,
    userId: string,
    dto: ApproveProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.transition(
      workspaceId,
      proposalId,
      userId,
      ProposalStatus.APPROVED,
      'PROPOSAL_APPROVED',
      (proposal) => ({
        approvedByUserId: userId,
        approvedAt: new Date(),
        selectedAlternativeNo:
          dto.selectedAlternativeNo ??
          proposal.selectedAlternativeNo ??
          1,
      }),
    );
  }

  /* ── REJECT ── */

  async reject(
    workspaceId: string,
    proposalId: string,
    userId: string,
    dto: RejectProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.transition(
      workspaceId,
      proposalId,
      userId,
      ProposalStatus.REJECTED,
      'PROPOSAL_REJECTED',
      () => ({
        rejectedByUserId: userId,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      }),
    );
  }

  /* ── APPLY (transactionnel) ── */

  async apply(
    workspaceId: string,
    proposalId: string,
    userId: string,
    dto: ApplyProposalDto,
  ): Promise<ProposalStateResponseDto> {
    const correlationId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findFirst({
        where: { id: proposalId, workspaceId },
        include: {
          actions: {
            where: {
              alternativeNo: { not: undefined },
            },
            orderBy: { actionOrder: 'asc' },
          },
        },
      });

      if (!proposal) throw new NotFoundException('Proposal introuvable');
      this.assertTransition(proposal.status, ProposalStatus.APPLIED);

      // AN-P0-08: Confidence gating — low confidence bloque l'apply direct
      const confidence = evaluateConfidence(
        proposal.confidenceScore ? Number(proposal.confidenceScore) : null,
      );
      if (!confidence.applyAllowed) {
        throw new ForbiddenException({
          code: 'CONFIDENCE_TOO_LOW',
          message: confidence.warning,
          confidenceLevel: confidence.level,
          confidenceScore: confidence.score,
        });
      }

      // Optimistic locking: vérifier la version si fournie
      if (dto.expectedVersion) {
        const currentVersion = proposal.updatedAt.toISOString();
        if (dto.expectedVersion !== currentVersion) {
          throw new ConflictException({
            code: 'PROPOSAL_STALE',
            message:
              'La proposal a été modifiée depuis votre dernière lecture. Veuillez rafraîchir.',
            currentVersion,
            expectedVersion: dto.expectedVersion,
          });
        }
      }

      const altNo = proposal.selectedAlternativeNo ?? 1;
      const actions = proposal.actions.filter(
        (a) => a.alternativeNo === altNo,
      );

      if (actions.length === 0) {
        throw new BadRequestException(
          `Aucune action trouvée pour l'alternative ${altNo}`,
        );
      }

      // AN-P0-09: Charger la config workspace pour scope expansion control
      const wsConfig = await tx.workspaceAiConfig.findUnique({
        where: { workspaceId },
        select: { maxEntitiesPerProposal: true },
      });
      const maxImpact = wsConfig?.maxEntitiesPerProposal ?? 50;

      // AN-P0-04: Valider les actions via BusinessRuleEngine
      for (const action of actions) {
        const ruleResult = await this.ruleEngine.evaluate({
          source: 'PROPOSAL',
          workspaceId,
          actorId: userId,
          actionType: action.actionType,
          payload: (action.payload as Record<string, unknown>) ?? {},
          context: {
            proposalId,
            alternativeNo: altNo,
            maxEntitiesImpactedPerProposal: maxImpact,
            entitiesImpacted: actions.length,
            ...(proposal.expectedPreconditions as Record<string, unknown> ?? {}),
          },
        });
        if (!ruleResult.passed) {
          throw new BadRequestException({
            code: 'BUSINESS_RULE_VIOLATION',
            message: 'Violations de regles metier detectees',
            violations: ruleResult.violations,
            evaluatedRules: ruleResult.evaluatedRules,
          });
        }
      }

      // AN-P0-05: Verifier les preconditions versionnees
      if (proposal.expectedPreconditions) {
        const preconditions = proposal.expectedPreconditions as Record<
          string,
          unknown
        >;
        const staleFields = await this.checkPreconditions(tx, preconditions);
        if (staleFields.length > 0) {
          throw new ConflictException({
            code: 'PROPOSAL_STALE',
            message:
              'Les donnees ont change depuis la creation de la proposal. Veuillez rafraichir.',
            staleFields,
          });
        }
      }

      const updated = await tx.proposal.update({
        where: { id: proposalId },
        data: {
          status: ProposalStatus.APPLIED,
          appliedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          selectedAlternativeNo: true,
          appliedAt: true,
          rejectedAt: true,
          rejectionReason: true,
        },
      });

      await tx.eventLog.create({
        data: {
          workspaceId,
          actorType: EventActorType.USER,
          actorId: userId,
          source: EventSource.AGENT,
          eventType: 'PROPOSAL_APPLIED',
          entityType: 'proposal',
          entityId: proposalId,
          correlationId,
          proposalId,
          payload: {
            alternativeNo: altNo,
            actionsApplied: actions.length,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

      return this.toProposalStateResponse(result, workspaceId);
  }

  /* ── ROLLBACK (compensation logique) ── */

  async rollback(
    workspaceId: string,
    proposalId: string,
    userId: string,
    dto: RollbackProposalDto,
  ): Promise<ProposalStateResponseDto> {
    const correlationId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findFirst({
        where: { id: proposalId, workspaceId },
        include: {
          actions: {
            where: { alternativeNo: { not: undefined } },
            orderBy: { actionOrder: 'desc' }, // Ordre inverse pour rollback
          },
        },
      });

      if (!proposal) throw new NotFoundException('Proposal introuvable');
      this.assertTransition(proposal.status, ProposalStatus.ROLLED_BACK);

      const altNo = proposal.selectedAlternativeNo ?? 1;
      const actions = proposal.actions.filter(
        (a) => a.alternativeNo === altNo,
      );

      // TODO: Appliquer les inversePayload en ordre inverse pour chaque action
      // Pour la v1, on marque uniquement l'état ROLLED_BACK

      const updated = await tx.proposal.update({
        where: { id: proposalId },
        data: { status: ProposalStatus.ROLLED_BACK },
        select: {
          id: true,
          status: true,
          selectedAlternativeNo: true,
          appliedAt: true,
          rejectedAt: true,
          rejectionReason: true,
        },
      });

      await tx.eventLog.create({
        data: {
          workspaceId,
          actorType: EventActorType.USER,
          actorId: userId,
          source: EventSource.AGENT,
          eventType: 'PROPOSAL_ROLLED_BACK',
          entityType: 'proposal',
          entityId: proposalId,
          correlationId,
          proposalId,
          payload: {
            reason: dto.reason ?? null,
            actionsRolledBack: actions.length,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

    return this.toProposalStateResponse(result, workspaceId);
  }

  /* ── Helpers internes ── */

  private assertTransition(
    current: ProposalStatus,
    target: ProposalStatus,
  ): void {
    const allowed = ProposalService.TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new BadRequestException(
        `Transition invalide: ${current} → ${target}`,
      );
    }
  }

  private async transition(
    workspaceId: string,
    proposalId: string,
    userId: string,
    targetStatus: ProposalStatus,
    eventType: string,
    extraData: (proposal: { selectedAlternativeNo: number | null }) => Record<string, unknown>,
  ): Promise<ProposalStateResponseDto> {
    const correlationId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findFirst({
        where: { id: proposalId, workspaceId },
        select: {
          id: true,
          status: true,
          selectedAlternativeNo: true,
        },
      });

      if (!proposal) throw new NotFoundException('Proposal introuvable');
      this.assertTransition(proposal.status, targetStatus);

      const extra = extraData(proposal);

      const updated = await tx.proposal.update({
        where: { id: proposalId },
        data: { status: targetStatus, ...extra },
        select: {
          id: true,
          status: true,
          selectedAlternativeNo: true,
          appliedAt: true,
          rejectedAt: true,
          rejectionReason: true,
        },
      });

      await tx.eventLog.create({
        data: {
          workspaceId,
          actorType: EventActorType.USER,
          actorId: userId,
          source: EventSource.AGENT,
          eventType,
          entityType: 'proposal',
          entityId: proposalId,
          correlationId,
          proposalId,
          payload: {
            previousStatus: proposal.status,
            newStatus: targetStatus,
            ...extra,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

    return this.toProposalStateResponse(result, workspaceId);
  }

  private toProposalStateResponse(
    proposal: {
      id: string;
      workspaceId?: string;
      status: ProposalStatus;
      intent?: string | null;
      confidenceScore?: Prisma.Decimal | number | null;
      selectedAlternativeNo?: number | null;
      actions?: Array<{
        id: string;
        actionType: string;
        targetEntityType?: string | null;
        targetEntityId?: string | null;
        actionOrder: number;
        payload: unknown;
      }>;
      explanation?: unknown;
      createdAt?: Date;
      updatedAt?: Date;
      appliedAt?: Date | null;
      rejectedAt?: Date | null;
      rejectionReason?: string | null;
    },
    workspaceId: string,
  ): ProposalStateResponseDto {
    return {
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId ?? workspaceId,
      status: proposal.status,
      intent: proposal.intent ?? null,
      confidenceScore:
        proposal.confidenceScore != null
          ? Number(proposal.confidenceScore)
          : null,
      selectedAlternativeNo: proposal.selectedAlternativeNo ?? null,
      actions:
        proposal.actions?.map((action) => ({
          id: action.id,
          actionType: action.actionType,
          entityType: action.targetEntityType ?? null,
          entityId: action.targetEntityId ?? null,
          actionOrder: action.actionOrder,
          payload: (action.payload as Record<string, unknown>) ?? {},
        })) ?? undefined,
      explanation:
        proposal.explanation != null
          ? (proposal.explanation as Record<string, unknown>)
          : null,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
      appliedAt: proposal.appliedAt ?? null,
      rejectedAt: proposal.rejectedAt ?? null,
      rejectionReason: proposal.rejectionReason ?? null,
    };
  }
  /**
   * AN-P0-05: Verifie les preconditions versionnees.
   *
   * Format attendu de expectedPreconditions:
   * {
   *   "entities": [
   *     { "type": "node", "id": "xyz", "expectedUpdatedAt": "2026-..." },
   *     { "type": "column", "id": "abc", "expectedUpdatedAt": "2026-..." }
   *   ]
   * }
   */
  private async checkPreconditions(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    preconditions: Record<string, unknown>,
  ): Promise<Array<{ type: string; id: string; expected: string; actual: string }>> {
    const entities = preconditions.entities as
      | Array<{ type: string; id: string; expectedUpdatedAt: string }>
      | undefined;

    if (!entities || !Array.isArray(entities)) return [];

    const staleFields: Array<{
      type: string;
      id: string;
      expected: string;
      actual: string;
    }> = [];

    for (const entity of entities) {
      let currentUpdatedAt: Date | null = null;

      if (entity.type === 'node') {
        const node = await tx.node.findUnique({
          where: { id: entity.id },
          select: { updatedAt: true },
        });
        currentUpdatedAt = node?.updatedAt ?? null;
      } else if (entity.type === 'column') {
        const column = await tx.column.findUnique({
          where: { id: entity.id },
          select: { updatedAt: true },
        });
        currentUpdatedAt = column?.updatedAt ?? null;
      } else if (entity.type === 'board') {
        const board = await tx.board.findUnique({
          where: { id: entity.id },
          select: { updatedAt: true },
        });
        currentUpdatedAt = board?.updatedAt ?? null;
      }

      if (currentUpdatedAt) {
        const currentIso = currentUpdatedAt.toISOString();
        if (currentIso !== entity.expectedUpdatedAt) {
          staleFields.push({
            type: entity.type,
            id: entity.id,
            expected: entity.expectedUpdatedAt,
            actual: currentIso,
          });
        }
      }
    }

    return staleFields;
  }
}
