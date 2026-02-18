import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProposalExplanation {
  reasoningSummary: string;
  entitiesImpacted: Array<{
    entityType: string;
    entityId: string;
    action: string;
  }>;
  ragChunkIds: string[];
  confidenceScore: number;
  confidenceLevel: string;
  ruleViolations: string[];
  promptVersion: string;
}

/**
 * AN-P1-08 — Explicabilite des proposals.
 *
 * Stocke et expose les explications pour chaque proposal:
 *   - reasoning summary (justification LLM)
 *   - entites impactees
 *   - chunks RAG utilises
 *   - score/level de confiance
 *   - violations de regles
 *   - version du prompt active
 */
@Injectable()
export class ProposalExplainService {
  private readonly logger = new Logger('ProposalExplain');

  constructor(private readonly prisma: PrismaService) {}

  /** Attacher une explication a un proposal */
  async attach(
    proposalId: string,
    explanation: ProposalExplanation,
  ): Promise<void> {
    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: {
        explanation: explanation as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Recuperer l'explication d'un proposal */
  async get(proposalId: string): Promise<ProposalExplanation | null> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { explanation: true },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal non trouve');
    }

    if (!proposal.explanation) return null;

    return proposal.explanation as unknown as ProposalExplanation;
  }

  /**
   * Construire une explication depuis les donnees existantes du proposal.
   * Utilise quand le LLM n'a pas fourni d'explication directement.
   */
  async buildFromProposal(proposalId: string): Promise<ProposalExplanation> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        intent: true,
        confidenceScore: true,
        actions: {
          select: {
            actionType: true,
            targetEntityType: true,
            targetEntityId: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal non trouve');
    }

    const explanation: ProposalExplanation = {
      reasoningSummary: proposal.intent ?? 'Aucune intention specifiee',
      entitiesImpacted: proposal.actions
        .filter((a) => a.targetEntityType && a.targetEntityId)
        .map((a) => ({
          entityType: a.targetEntityType!,
          entityId: a.targetEntityId!,
          action: a.actionType,
        })),
      ragChunkIds: [],
      confidenceScore: proposal.confidenceScore
        ? Number(proposal.confidenceScore)
        : 0,
      confidenceLevel: this.getConfidenceLevel(
        proposal.confidenceScore ? Number(proposal.confidenceScore) : 0,
      ),
      ruleViolations: [],
      promptVersion: 'unknown',
    };

    // Persister l'explication generee
    await this.attach(proposalId, explanation);

    return explanation;
  }

  private getConfidenceLevel(score: number): string {
    if (score >= 0.8) return 'HIGH';
    if (score >= 0.5) return 'MEDIUM';
    return 'LOW';
  }
}
