import { Injectable, Logger } from '@nestjs/common';
import {
  BusinessRule,
  EngineResult,
  RuleContext,
  RuleViolation,
} from './rule.types';

@Injectable()
export class BusinessRuleEngine {
  private readonly logger = new Logger('BusinessRuleEngine');
  private readonly rules: BusinessRule[] = [];

  /** Enregistrer une règle. Appelé par chaque module au démarrage. */
  register(rule: BusinessRule): void {
    this.rules.push(rule);
    this.logger.log(`Rule registered: ${rule.name}`);
  }

  /** Évaluer toutes les règles applicables au contexte donné. */
  async evaluate(ctx: RuleContext): Promise<EngineResult> {
    const applicable = this.rules.filter(
      (r) => r.appliesTo.length === 0 || r.appliesTo.includes(ctx.actionType),
    );

    const violations: RuleViolation[] = [];
    const evaluatedRules: string[] = [];

    for (const rule of applicable) {
      evaluatedRules.push(rule.name);
      try {
        const result = await rule.evaluate(ctx);
        if (!result.passed) {
          violations.push(...result.violations);
        }
      } catch (error) {
        this.logger.error(
          `Rule ${rule.name} threw an error: ${error instanceof Error ? error.message : String(error)}`,
        );
        violations.push({
          code: 'RULE_ENGINE_ERROR',
          message: `Erreur interne lors de l'evaluation de la regle ${rule.name}`,
          details: { ruleName: rule.name },
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      evaluatedRules,
    };
  }

  /** Liste les règles enregistrées (debug/observabilité). */
  listRules(): string[] {
    return this.rules.map((r) => r.name);
  }
}
