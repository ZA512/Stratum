import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PublicAgentGuard } from './public-agent.guard';
import { RequirePublicAgentScope } from './public-agent-scope.decorator';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto, WebhookResponseDto } from './dto/webhook.dto';

@ApiTags('Webhooks')
@Controller('public/workspaces/:workspaceId/webhooks')
@UseGuards(PublicAgentGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @RequirePublicAgentScope('agent:command')
  @ApiOperation({ summary: 'Créer un webhook sortant' })
  @ApiParam({ name: 'workspaceId' })
  @ApiOkResponse({ type: WebhookResponseDto })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWebhookDto,
  ): Promise<WebhookResponseDto> {
    const wh = await this.webhookService.createWebhook(
      workspaceId,
      dto.url,
      dto.eventTypes,
      dto.description,
    );
    return {
      id: wh.id,
      workspaceId: wh.workspaceId,
      url: wh.url,
      eventTypes: wh.eventTypes,
      enabled: wh.enabled,
      description: wh.description ?? undefined,
      createdAt: wh.createdAt.toISOString(),
    };
  }

  @Get()
  @RequirePublicAgentScope('agent:command')
  @ApiOperation({ summary: 'Lister les webhooks d\'un workspace' })
  @ApiParam({ name: 'workspaceId' })
  @ApiOkResponse({ type: [WebhookResponseDto] })
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<WebhookResponseDto[]> {
    const webhooks = await this.webhookService.listWebhooks(workspaceId);
    return webhooks.map((wh) => ({
      id: wh.id,
      workspaceId: wh.workspaceId,
      url: wh.url,
      eventTypes: wh.eventTypes,
      enabled: wh.enabled,
      description: wh.description ?? undefined,
      createdAt: wh.createdAt.toISOString(),
    }));
  }

  @Delete(':webhookId')
  @RequirePublicAgentScope('agent:command')
  @ApiOperation({ summary: 'Supprimer un webhook' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'webhookId' })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('webhookId') webhookId: string,
  ): Promise<{ ok: boolean }> {
    await this.webhookService.deleteWebhook(workspaceId, webhookId);
    return { ok: true };
  }
}
