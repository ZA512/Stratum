import {
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { EmbeddingCostService } from './embedding-cost.service';
import { InMemoryEmbeddingStore } from './in-memory-embedding.store';
import { RagLifecycleService } from './rag-lifecycle.service';
import { RagRebuildService } from './rag-rebuild.service';

/**
 * Controller RAG (AN-P1-03/P1-04/P1-05)
 */
@Controller('workspaces/:workspaceId/rag')
export class RagController {
  constructor(
    private readonly rebuildService: RagRebuildService,
    private readonly lifecycleService: RagLifecycleService,
    private readonly costService: EmbeddingCostService,
    private readonly embeddingStore: InMemoryEmbeddingStore,
  ) {}

  @Post('rebuild')
  async rebuild(@Param('workspaceId') workspaceId: string) {
    return this.rebuildService.rebuild(workspaceId);
  }

  @Post('prune')
  async prune(@Param('workspaceId') workspaceId: string) {
    return this.lifecycleService.prune(workspaceId);
  }

  @Get('stats')
  async stats(@Param('workspaceId') workspaceId: string) {
    return this.lifecycleService.getStats(workspaceId);
  }

  @Get('costs')
  async costs(@Param('workspaceId') workspaceId: string) {
    return this.costService.getProjection(workspaceId);
  }

  @Get('health')
  async health() {
    return this.embeddingStore.health();
  }
}
