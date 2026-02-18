import { BusinessRule, RuleContext, RuleResult, RuleViolation } from './rule.types';

/** Vérifie que le titre est présent et respecte la longueur max. */
export class TitleRequiredRule implements BusinessRule {
  readonly name = 'TitleRequired';
  readonly appliesTo = ['CREATE_NODE', 'UPDATE_NODE'];

  evaluate(ctx: RuleContext): RuleResult {
    const title = ctx.payload.title as string | undefined;
    const violations: RuleViolation[] = [];

    if (ctx.actionType === 'CREATE_NODE' || title !== undefined) {
      if (!title || !title.trim()) {
        violations.push({
          code: 'TITLE_REQUIRED',
          message: 'Le titre est obligatoire',
        });
      } else if (title.trim().length > 200) {
        violations.push({
          code: 'TITLE_TOO_LONG',
          message: 'Le titre ne doit pas depasser 200 caracteres',
          details: { maxLength: 200, actualLength: title.trim().length },
        });
      }
    }

    return { passed: violations.length === 0, violations };
  }
}

/** Vérifie la limite WIP d'une colonne avant ajout/déplacement. */
export class WipLimitRule implements BusinessRule {
  readonly name = 'WipLimit';
  readonly appliesTo = ['CREATE_NODE', 'MOVE_NODE'];

  evaluate(ctx: RuleContext): RuleResult {
    const wipLimit = ctx.context.targetColumnWipLimit as number | undefined;
    const currentCount = ctx.context.targetColumnNodeCount as number | undefined;

    if (
      wipLimit != null &&
      wipLimit > 0 &&
      currentCount != null &&
      currentCount >= wipLimit
    ) {
      return {
        passed: false,
        violations: [
          {
            code: 'WIP_LIMIT_REACHED',
            message: `La colonne a atteint sa limite WIP (${wipLimit})`,
            details: { wipLimit, currentCount },
          },
        ],
      };
    }

    return { passed: true, violations: [] };
  }
}

/** Empêche le passage en DONE si des enfants ne sont pas terminés. */
export class DoneGatingRule implements BusinessRule {
  readonly name = 'DoneGating';
  readonly appliesTo = ['MOVE_NODE', 'UPDATE_NODE'];

  evaluate(ctx: RuleContext): RuleResult {
    const movingToDone = ctx.context.targetColumnIsDone as boolean | undefined;
    const incompleteChildrenCount = ctx.context.incompleteChildrenCount as
      | number
      | undefined;

    if (movingToDone && incompleteChildrenCount && incompleteChildrenCount > 0) {
      return {
        passed: false,
        violations: [
          {
            code: 'NODE_HAS_ACTIVE_CHILDREN',
            message: `${incompleteChildrenCount} sous-tache(s) non terminee(s)`,
            details: { incompleteChildrenCount },
          },
        ],
      };
    }

    return { passed: true, violations: [] };
  }
}

/** Interdit les déplacements inter-équipes. */
export class CrossTeamRule implements BusinessRule {
  readonly name = 'CrossTeam';
  readonly appliesTo = ['MOVE_NODE'];

  evaluate(ctx: RuleContext): RuleResult {
    const sourceTeamId = ctx.context.sourceTeamId as string | undefined;
    const targetTeamId = ctx.context.targetTeamId as string | undefined;

    if (sourceTeamId && targetTeamId && sourceTeamId !== targetTeamId) {
      return {
        passed: false,
        violations: [
          {
            code: 'CROSS_TEAM_MOVE_FORBIDDEN',
            message: 'Le deplacement inter-equipe est interdit',
            details: { sourceTeamId, targetTeamId },
          },
        ],
      };
    }

    return { passed: true, violations: [] };
  }
}

/** Limite d'impact : refuse une proposal qui touche trop d'entités. */
export class ScopeExpansionRule implements BusinessRule {
  readonly name = 'ScopeExpansion';
  readonly appliesTo = []; // S'applique à toutes les actions

  evaluate(ctx: RuleContext): RuleResult {
    const maxImpact = ctx.context.maxEntitiesImpactedPerProposal as
      | number
      | undefined;
    const entitiesImpacted = ctx.context.entitiesImpacted as
      | number
      | undefined;

    if (
      maxImpact != null &&
      maxImpact > 0 &&
      entitiesImpacted != null &&
      entitiesImpacted > maxImpact
    ) {
      return {
        passed: false,
        violations: [
          {
            code: 'SCOPE_EXPANSION_EXCEEDED',
            message: `La proposal impacte ${entitiesImpacted} entites (limite: ${maxImpact})`,
            details: { maxImpact, entitiesImpacted },
          },
        ],
      };
    }

    return { passed: true, violations: [] };
  }
}
