import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AN-P0-07 — Kill Switch multi-niveaux
 *
 * Niveaux:
 *   1. GLOBAL   — arrete toute activite agent sur l'instance
 *   2. WORKSPACE — arrete l'agent pour un workspace specifique
 *   3. FEATURE  — arrete une feature agent specifique (command, chat, apply, etc.)
 *
 * Auto-kill: circuit breaker base sur le taux d'erreur.
 */

export type KillSwitchLevel = 'GLOBAL' | 'WORKSPACE' | 'FEATURE';

export interface KillSwitchState {
  global: boolean;
  workspaces: Set<string>;
  features: Set<string>;
  autoKillActive: boolean;
}

@Injectable()
export class KillSwitchService {
  private readonly logger = new Logger('KillSwitch');

  /** Etat en memoire — rapide, pas de latence DB */
  private globalKilled = false;
  private readonly killedWorkspaces = new Set<string>();
  private readonly killedFeatures = new Set<string>();

  /** Circuit breaker */
  private errorWindow: number[] = [];
  private autoKillActive = false;
  private readonly ERROR_WINDOW_MS = 60_000; // 1 minute
  private readonly ERROR_THRESHOLD = 10; // 10 erreurs/minute declenchent auto-kill

  constructor(private readonly prisma: PrismaService) {
    this.loadPersistedState().catch((err) =>
      this.logger.error(`Echec chargement kill-switch persiste: ${err}`),
    );
  }

  /** Charger l'etat persiste depuis workspace_ai_config au demarrage */
  private async loadPersistedState(): Promise<void> {
    const configs = await this.prisma.workspaceAiConfig.findMany({
      where: { aiLevel: 'OFF' },
      select: { workspaceId: true },
    });
    for (const c of configs) {
      this.killedWorkspaces.add(c.workspaceId);
    }
    if (configs.length > 0) {
      this.logger.log(
        `Kill-switch charge: ${configs.length} workspace(s) desactive(s)`,
      );
    }
  }

  /* ── Checks ── */

  /**
   * Verifie si l'agent est autorise a operer.
   * Lance ForbiddenException si kill-switch actif.
   */
  assertAgentAllowed(workspaceId: string, feature?: string): void {
    if (this.globalKilled || this.autoKillActive) {
      throw new ForbiddenException({
        code: 'AGENT_KILLED_GLOBAL',
        message: "L'agent est desactive globalement",
        level: this.autoKillActive ? 'AUTO_KILL' : 'GLOBAL',
      });
    }

    if (this.killedWorkspaces.has(workspaceId)) {
      throw new ForbiddenException({
        code: 'AGENT_KILLED_WORKSPACE',
        message: "L'agent est desactive pour ce workspace",
        level: 'WORKSPACE',
        workspaceId,
      });
    }

    if (feature && this.killedFeatures.has(feature)) {
      throw new ForbiddenException({
        code: 'AGENT_KILLED_FEATURE',
        message: `La feature "${feature}" est desactivee`,
        level: 'FEATURE',
        feature,
      });
    }
  }

  /** Version non-throwing: retourne un booleen */
  isAllowed(workspaceId: string, feature?: string): boolean {
    if (this.globalKilled || this.autoKillActive) return false;
    if (this.killedWorkspaces.has(workspaceId)) return false;
    if (feature && this.killedFeatures.has(feature)) return false;
    return true;
  }

  /* ── Controls ── */

  killGlobal(): void {
    this.globalKilled = true;
    this.logger.warn('KILL SWITCH: global activé');
  }

  resumeGlobal(): void {
    this.globalKilled = false;
    this.autoKillActive = false;
    this.errorWindow = [];
    this.logger.log('KILL SWITCH: global desactive');
  }

  killWorkspace(workspaceId: string): void {
    this.killedWorkspaces.add(workspaceId);
    this.logger.warn(`KILL SWITCH: workspace ${workspaceId} desactive`);
  }

  resumeWorkspace(workspaceId: string): void {
    this.killedWorkspaces.delete(workspaceId);
    this.logger.log(`KILL SWITCH: workspace ${workspaceId} reactive`);
  }

  killFeature(feature: string): void {
    this.killedFeatures.add(feature);
    this.logger.warn(`KILL SWITCH: feature "${feature}" desactivee`);
  }

  resumeFeature(feature: string): void {
    this.killedFeatures.delete(feature);
    this.logger.log(`KILL SWITCH: feature "${feature}" reactivee`);
  }

  /* ── Circuit breaker ── */

  /**
   * Enregistrer une erreur agent. Si le seuil est depasse,
   * declenche l'auto-kill.
   */
  recordError(): void {
    const now = Date.now();
    this.errorWindow.push(now);

    // Nettoyer les erreurs hors fenetre
    const cutoff = now - this.ERROR_WINDOW_MS;
    this.errorWindow = this.errorWindow.filter((t) => t >= cutoff);

    if (this.errorWindow.length >= this.ERROR_THRESHOLD && !this.autoKillActive) {
      this.autoKillActive = true;
      this.logger.error(
        `AUTO-KILL: seuil d'erreurs atteint (${this.errorWindow.length}/${this.ERROR_THRESHOLD} en ${this.ERROR_WINDOW_MS}ms)`,
      );
    }
  }

  /* ── Status ── */

  getState(): KillSwitchState {
    return {
      global: this.globalKilled,
      workspaces: new Set(this.killedWorkspaces),
      features: new Set(this.killedFeatures),
      autoKillActive: this.autoKillActive,
    };
  }
}
