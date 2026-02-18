import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * AN-P0-10 — Observabilite minimale agent
 *
 * Metriques en memoire pour l'agent. Integrable avec prom-client
 * via MetricsService quand METRICS_ENABLED=true.
 *
 * Metriques cles:
 *   - agent_requests_total (command/chat, par statut)
 *   - agent_latency_seconds (p50, p95, p99)
 *   - agent_errors_total (par type d'erreur)
 *   - proposal_transitions_total (par transition)
 *   - confidence_distribution (par niveau HIGH/MEDIUM/LOW)
 *   - kill_switch_activations_total
 *   - degraded_mode_rate
 */

export interface AgentMetricsSummary {
  requests: {
    command: { total: number; errors: number };
    chat: { total: number; errors: number };
  };
  proposals: {
    created: number;
    applied: number;
    rejected: number;
    rolledBack: number;
    staleConflicts: number;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  confidence: {
    high: number;
    medium: number;
    low: number;
  };
  killSwitch: {
    activations: number;
    currentlyActive: boolean;
  };
  ruleViolations: number;
}

@Injectable()
export class AgentMetricsService implements OnModuleDestroy {
  private readonly logger = new Logger('AgentMetrics');

  // Compteurs
  private commandTotal = 0;
  private commandErrors = 0;
  private chatTotal = 0;
  private chatErrors = 0;
  private proposalsCreated = 0;
  private proposalsApplied = 0;
  private proposalsRejected = 0;
  private proposalsRolledBack = 0;
  private staleConflicts = 0;
  private confidenceHigh = 0;
  private confidenceMedium = 0;
  private confidenceLow = 0;
  private killSwitchActivations = 0;
  private killSwitchActive = false;
  private ruleViolations = 0;

  // Latences (sliding window des dernieres 1000 mesures)
  private latencies: number[] = [];
  private readonly MAX_LATENCY_WINDOW = 1000;

  onModuleDestroy(): void {
    this.latencies = [];
  }

  /* ── Enregistrement ── */

  recordCommand(durationMs: number, error?: boolean): void {
    this.commandTotal++;
    if (error) this.commandErrors++;
    this.recordLatency(durationMs);
  }

  recordChat(durationMs: number, error?: boolean): void {
    this.chatTotal++;
    if (error) this.chatErrors++;
    this.recordLatency(durationMs);
  }

  recordProposalCreated(): void {
    this.proposalsCreated++;
  }

  recordProposalApplied(): void {
    this.proposalsApplied++;
  }

  recordProposalRejected(): void {
    this.proposalsRejected++;
  }

  recordProposalRolledBack(): void {
    this.proposalsRolledBack++;
  }

  recordStaleConflict(): void {
    this.staleConflicts++;
  }

  recordConfidence(level: 'HIGH' | 'MEDIUM' | 'LOW'): void {
    if (level === 'HIGH') this.confidenceHigh++;
    else if (level === 'MEDIUM') this.confidenceMedium++;
    else this.confidenceLow++;
  }

  recordKillSwitchActivation(active: boolean): void {
    if (active) this.killSwitchActivations++;
    this.killSwitchActive = active;
  }

  recordRuleViolation(): void {
    this.ruleViolations++;
  }

  /* ── Lecture ── */

  getSummary(): AgentMetricsSummary {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sorted.length === 0) return 0;
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    };

    return {
      requests: {
        command: { total: this.commandTotal, errors: this.commandErrors },
        chat: { total: this.chatTotal, errors: this.chatErrors },
      },
      proposals: {
        created: this.proposalsCreated,
        applied: this.proposalsApplied,
        rejected: this.proposalsRejected,
        rolledBack: this.proposalsRolledBack,
        staleConflicts: this.staleConflicts,
      },
      latency: {
        p50Ms: percentile(50),
        p95Ms: percentile(95),
        p99Ms: percentile(99),
      },
      confidence: {
        high: this.confidenceHigh,
        medium: this.confidenceMedium,
        low: this.confidenceLow,
      },
      killSwitch: {
        activations: this.killSwitchActivations,
        currentlyActive: this.killSwitchActive,
      },
      ruleViolations: this.ruleViolations,
    };
  }

  /* ── Interne ── */

  private recordLatency(durationMs: number): void {
    this.latencies.push(durationMs);
    if (this.latencies.length > this.MAX_LATENCY_WINDOW) {
      this.latencies.shift();
    }
  }
}
