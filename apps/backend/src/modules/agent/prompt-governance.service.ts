import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PromptVersion {
  version: string;
  content: string;
  activatedAt: Date;
}

/**
 * AN-P1-06 — Prompt governance runtime.
 *
 * Permet d'activer/rollbacker des versions de prompt systeme
 * sans redeploiement. Utilise `WorkspaceAiConfig.systemPromptVersion`
 * + stockage des versions dans EventLog pour audit.
 *
 * Pour le MVP, les prompts sont stockes en memoire (Map).
 * En production, ils seraient dans une table dediee ou un bucket.
 */
@Injectable()
export class PromptGovernanceService {
  private readonly logger = new Logger('PromptGovernance');

  // Registre des prompts disponibles (version -> contenu)
  private readonly promptRegistry = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {
    // Enregistrer les versions par defaut
    this.promptRegistry.set(
      'v1.0',
      'Tu es un assistant de gestion de projet. Tu proposes des actions structurees sous forme de proposals. Tu ne modifies jamais directement les donnees.',
    );
    this.promptRegistry.set(
      'v1.1',
      'Tu es un assistant de gestion de projet Stratum. Tu analyses le contexte du workspace et proposes des actions structurees via le systeme de proposals. Chaque action doit etre justifiee et reversible. En cas de doute, demande clarification via le mode chat.',
    );
  }

  /** Enregistrer une nouvelle version de prompt */
  registerVersion(version: string, content: string): void {
    this.promptRegistry.set(version, content);
    this.logger.log(`Prompt version ${version} enregistree`);
  }

  /** Lister les versions disponibles */
  listVersions(): string[] {
    return Array.from(this.promptRegistry.keys());
  }

  /** Obtenir le contenu d'une version */
  getVersionContent(version: string): string | null {
    return this.promptRegistry.get(version) ?? null;
  }

  /** Activer une version pour un workspace */
  async activate(
    workspaceId: string,
    version: string,
    activatedByUserId: string,
  ): Promise<void> {
    if (!this.promptRegistry.has(version)) {
      throw new NotFoundException(`Prompt version ${version} non trouvee`);
    }

    const previousConfig = await this.prisma.workspaceAiConfig.findUnique({
      where: { workspaceId },
      select: { systemPromptVersion: true },
    });

    const previousVersion = previousConfig?.systemPromptVersion ?? null;

    await this.prisma.workspaceAiConfig.upsert({
      where: { workspaceId },
      update: { systemPromptVersion: version },
      create: {
        workspaceId,
        systemPromptVersion: version,
      },
    });

    // Audit trail
    await this.prisma.eventLog.create({
      data: {
        workspaceId,
        actorType: 'USER',
        actorId: activatedByUserId,
        source: 'API',
        eventType: 'PROMPT_VERSION_ACTIVATED',
        entityType: 'workspace_ai_config',
        entityId: workspaceId,
        payload: {
          previousVersion,
          newVersion: version,
        },
      },
    });

    this.logger.log(
      `Workspace ${workspaceId}: prompt ${previousVersion} -> ${version}`,
    );
  }

  /** Rollback vers la version precedente */
  async rollback(
    workspaceId: string,
    rolledBackByUserId: string,
  ): Promise<string> {
    // Trouver la derniere activation
    const lastActivation = await this.prisma.eventLog.findFirst({
      where: {
        workspaceId,
        eventType: 'PROMPT_VERSION_ACTIVATED',
      },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });

    if (!lastActivation) {
      throw new NotFoundException('Aucun historique de prompt pour ce workspace');
    }

    const payload = lastActivation.payload as Record<string, unknown>;
    const previousVersion = payload.previousVersion as string | null;

    if (!previousVersion) {
      throw new NotFoundException(
        'Pas de version precedente disponible pour rollback',
      );
    }

    await this.activate(workspaceId, previousVersion, rolledBackByUserId);
    return previousVersion;
  }

  /** Obtenir le prompt actif pour un workspace */
  async getActivePrompt(workspaceId: string): Promise<{
    version: string;
    content: string;
  }> {
    const config = await this.prisma.workspaceAiConfig.findUnique({
      where: { workspaceId },
      select: { systemPromptVersion: true },
    });

    const version = config?.systemPromptVersion ?? 'v1.0';
    const content = this.promptRegistry.get(version);

    if (!content) {
      // Fallback vers v1.0
      return {
        version: 'v1.0',
        content: this.promptRegistry.get('v1.0')!,
      };
    }

    return { version, content };
  }
}
