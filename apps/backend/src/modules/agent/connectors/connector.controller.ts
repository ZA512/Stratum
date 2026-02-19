import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  RawBody,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConnectorRouterService } from './connector-router.service';
import { PublicAgentGuard } from '../public-agent.guard';
import { ConnectorChannel } from './connector.types';

@ApiTags('Connectors')
@Controller('connectors')
export class ConnectorController {
  constructor(private readonly router: ConnectorRouterService) {}

  @Post(':channel/inbound')
  @ApiOperation({ summary: 'Inbound webhook for external connectors' })
  async handleInbound(
    @Param('channel') channel: string,
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
  ) {
    const adapter = this.router.getAdapter(channel as ConnectorChannel);
    if (!adapter) {
      return { ok: false, error: `Unknown channel: ${channel}` };
    }

    // Verify request authenticity
    adapter.verifyRequest(headers, body);

    // Handle Slack URL verification challenge
    if (
      channel === 'slack' &&
      typeof body === 'object' &&
      body !== null &&
      'challenge' in body
    ) {
      return { challenge: (body as { challenge: string }).challenge };
    }

    const message = adapter.parseInbound(body);
    if (!message) {
      return { ok: true, skipped: true };
    }

    const response = await this.router.processInbound(message);
    return {
      ok: true,
      response: adapter.formatOutbound(response),
    };
  }
}
