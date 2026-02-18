import { Module, OnModuleInit } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentMetricsService } from './agent-metrics.service';
import { AgentService } from './agent.service';
import { AgentContextBuilder } from './context-builder.service';
import { BriefReportService } from './brief-report.service';
import { DriftControlService } from './drift-control.service';
import { KillSwitchService } from './kill-switch.service';
import { ProposalController } from './proposal.controller';
import { ProposalExplainService } from './proposal-explain.service';
import { ProposalService } from './proposal.service';
import { PromptGovernanceService } from './prompt-governance.service';
import {
  EmbeddingCostService,
  EntityFlattenerService,
  InMemoryEmbeddingStore,
  RagController,
  RagIndexWorkerService,
  RagLifecycleService,
  RagRebuildService,
} from './rag';
import {
  BusinessRuleEngine,
  CrossTeamRule,
  DoneGatingRule,
  ScopeExpansionRule,
  TitleRequiredRule,
  WipLimitRule,
} from './rules';

@Module({
  controllers: [AgentController, ProposalController, RagController],
  providers: [
    AgentService,
    ProposalService,
    ProposalExplainService,
    BusinessRuleEngine,
    AgentContextBuilder,
    KillSwitchService,
    AgentMetricsService,
    PromptGovernanceService,
    DriftControlService,
    EntityFlattenerService,
    InMemoryEmbeddingStore,
    RagIndexWorkerService,
    RagRebuildService,
    RagLifecycleService,
    EmbeddingCostService,
    BriefReportService,
  ],
  exports: [
    ProposalService,
    ProposalExplainService,
    BusinessRuleEngine,
    AgentContextBuilder,
    KillSwitchService,
    AgentMetricsService,
    PromptGovernanceService,
    DriftControlService,
    RagIndexWorkerService,
    RagRebuildService,
    RagLifecycleService,
    EmbeddingCostService,
    BriefReportService,
  ],
})
export class AgentModule implements OnModuleInit {
  constructor(private readonly ruleEngine: BusinessRuleEngine) {}

  onModuleInit(): void {
    this.ruleEngine.register(new TitleRequiredRule());
    this.ruleEngine.register(new WipLimitRule());
    this.ruleEngine.register(new DoneGatingRule());
    this.ruleEngine.register(new CrossTeamRule());
    this.ruleEngine.register(new ScopeExpansionRule());
  }
}
