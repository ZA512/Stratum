import { Module } from '@nestjs/common';
import { NodesModule } from '../nodes/nodes.module';
import { WorkflowAutomationScheduler } from './workflow-automation.scheduler';

@Module({
  imports: [NodesModule],
  providers: [WorkflowAutomationScheduler],
})
export class WorkflowAutomationModule {}
