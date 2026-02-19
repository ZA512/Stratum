import { Module, OnModuleInit } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentMetricsService } from './agent-metrics.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { AgentService } from './agent.service';
import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';
import { AiModelCatalogController } from './ai-model-catalog.controller';
import { AgentContextBuilder } from './context-builder.service';
import { BriefReportService } from './brief-report.service';
import { ConnectorController, ConnectorRouterService } from './connectors';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { DriftControlService } from './drift-control.service';
import { EventStreamController } from './event-stream.controller';
import { EventStreamService } from './event-stream.service';
import { GoalController } from './goal.controller';
import { GoalService } from './goal.service';
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
import { PublicAgentAccessService } from './public-agent-access.service';
import { PublicAgentController } from './public-agent.controller';
import { PublicAgentGuard } from './public-agent.guard';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  controllers: [
    AgentController,
    AiConfigController,
    AiModelCatalogController,
    ProposalController,
    RagController,
    PublicAgentController,
    ConnectorController,
    ConversationController,
    EventStreamController,
    WebhookController,
    GoalController,
  ],
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
    PublicAgentAccessService,
    PublicAgentGuard,
    ConnectorRouterService,
    EventStreamService,
    WebhookService,
    AgentSchedulerService,
    GoalService,
    AiConfigService,
    ConversationService,
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
    EventStreamService,
    WebhookService,
    AgentSchedulerService,
    GoalService,
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
