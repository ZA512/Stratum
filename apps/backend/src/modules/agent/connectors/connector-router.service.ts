import { Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventActorType, EventSource } from '@prisma/client';
import {
  ConnectorAdapter,
  ConnectorChannel,
  InboundConnectorMessage,
  OutboundConnectorMessage,
} from './connector.types';

@Injectable()
export class ConnectorRouterService {
  private readonly logger = new Logger(ConnectorRouterService.name);
  private readonly adapters = new Map<ConnectorChannel, ConnectorAdapter>();

  constructor(
    private readonly agentService: AgentService,
    private readonly prisma: PrismaService,
  ) {}

  registerAdapter(adapter: ConnectorAdapter): void {
    this.adapters.set(adapter.channel, adapter);
    this.logger.log(`Connector adapter registered: ${adapter.channel}`);
  }

  getAdapter(channel: ConnectorChannel): ConnectorAdapter | undefined {
    return this.adapters.get(channel);
  }

  /**
   * Process an inbound message from an external connector.
   * Detects intent (command vs chat) heuristically from the message text.
   */
  async processInbound(
    message: InboundConnectorMessage,
  ): Promise<OutboundConnectorMessage> {
    const adapter = this.adapters.get(message.channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${message.channel}`);
    }

    // Log the inbound connector event
    await this.prisma.eventLog.create({
      data: {
        workspaceId: message.workspaceId,
        actorType: EventActorType.SYSTEM,
        actorId: `connector:${message.channel}:${message.senderExternalId}`,
        source: EventSource.API,
        eventType: 'CONNECTOR_INBOUND_RECEIVED',
        entityType: 'workspace',
        entityId: message.workspaceId,
        payload: {
          channel: message.channel,
          channelMessageId: message.channelMessageId,
          senderExternalId: message.senderExternalId,
          textLength: message.text.length,
        },
      },
    });

    // Heuristic: messages starting with "/" or containing "propose", "crée", "déplace"
    // are treated as commands; otherwise as chat
    const isCommand = this.detectCommandIntent(message.text);

    if (isCommand) {
      const commandText = message.text.replace(/^\/command\s*/i, '').trim();
      const response = await this.agentService.commandFromPublicToken(
        message.workspaceId,
        `connector:${message.channel}`,
        {
          intent: commandText,
          context: { channel: message.channel, ...message.metadata },
          sessionId: `connector_${message.channel}_${message.senderExternalId}`,
        },
      );

      return {
        channel: message.channel,
        channelMessageId: message.channelMessageId,
        text: `Proposition créée (${response.proposalStatus}): ${response.alternatives[0]?.summary ?? 'aucune alternative'}`,
        proposalId: response.proposalId,
        proposalUrl: `/workspaces/${message.workspaceId}/proposals/${response.proposalId}`,
      };
    }

    // Chat mode
    const response = await this.agentService.chatFromPublicToken(
      message.workspaceId,
      `connector:${message.channel}`,
      {
        message: message.text,
        context: { channel: message.channel, ...message.metadata },
        sessionId: `connector_${message.channel}_${message.senderExternalId}`,
      },
    );

    return {
      channel: message.channel,
      channelMessageId: message.channelMessageId,
      text: response.answer,
      metadata: response.suggestedCommandPayload
        ? { suggestedCommand: response.suggestedCommandPayload }
        : undefined,
    };
  }

  private detectCommandIntent(text: string): boolean {
    if (text.startsWith('/command')) return true;

    const commandPatterns =
      /\b(propose|crée|créer|déplace|déplacer|archive|archiver|réorganise|split|scission|regroup)\b/i;
    return commandPatterns.test(text);
  }
}
