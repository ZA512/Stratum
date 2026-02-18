/**
 * BusinessRuleEngine — AN-P0-04
 *
 * Moteur de règles métier centralisé. Chaque règle implémente
 * l'interface BusinessRule et est évaluée de manière uniforme
 * quel que soit le canal d'origine (manuel, proposal, agent, scheduler).
 */

/* ── Types ── */

export type RuleSource = 'MANUAL' | 'PROPOSAL' | 'AGENT' | 'SCHEDULER';

export interface RuleContext {
  /** Canal d'origine de la mutation */
  source: RuleSource;
  /** ID du workspace */
  workspaceId: string;
  /** ID de l'utilisateur ou acteur */
  actorId: string;
  /** Type d'action métier (ex: 'CREATE_NODE', 'MOVE_NODE', 'UPDATE_NODE', 'DELETE_NODE') */
  actionType: string;
  /** Payload de l'action */
  payload: Record<string, unknown>;
  /** Données de contexte pré-chargées (entités existantes, limites, etc.) */
  context: Record<string, unknown>;
}

export interface RuleViolation {
  /** Code machine stable pour le frontend */
  code: string;
  /** Message lisible */
  message: string;
  /** Détails supplémentaires (compteurs, limites, etc.) */
  details?: Record<string, unknown>;
}

export interface RuleResult {
  passed: boolean;
  violations: RuleViolation[];
}

export interface BusinessRule {
  /** Identifiant unique de la règle */
  readonly name: string;
  /** Types d'actions gérés par cette règle (vide = toutes) */
  readonly appliesTo: string[];
  /** Évaluer la règle sur le contexte donné */
  evaluate(ctx: RuleContext): RuleResult | Promise<RuleResult>;
}

/* ── Résultat agrégé ── */

export interface EngineResult {
  passed: boolean;
  violations: RuleViolation[];
  /** Règles évaluées */
  evaluatedRules: string[];
}
