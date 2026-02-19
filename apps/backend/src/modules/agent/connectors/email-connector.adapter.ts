import {
  ConnectorAdapter,
  InboundConnectorMessage,
  OutboundConnectorMessage,
} from './connector.types';
import { UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

interface EmailInboundPayload {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  messageId: string;
  headers?: Record<string, string>;
}

export class EmailConnectorAdapter implements ConnectorAdapter {
  readonly channel = 'email' as const;

  private readonly inboundSecret: string;

  constructor(inboundSecret: string) {
    this.inboundSecret = inboundSecret;
  }

  parseInbound(payload: unknown): InboundConnectorMessage | null {
    const data = payload as EmailInboundPayload;

    if (!data.from || !data.textBody || !data.to) {
      return null;
    }

    // Extract workspace ID from recipient address pattern: agent+<workspaceId>@domain.com
    const match = data.to.match(/agent\+([^@]+)@/);
    if (!match) {
      return null;
    }

    return {
      channel: 'email',
      channelMessageId: data.messageId,
      workspaceId: match[1],
      senderExternalId: data.from,
      text: data.textBody.slice(0, 4000),
      metadata: { subject: data.subject },
      receivedAt: new Date(),
    };
  }

  formatOutbound(message: OutboundConnectorMessage): unknown {
    let body = message.text;

    if (message.proposalId && message.proposalUrl) {
      body += `\n\n---\nVoir la proposition: ${message.proposalUrl}`;
    }

    return {
      subject: message.proposalId
        ? `[Stratum] Proposition ${message.proposalId}`
        : '[Stratum] Réponse Agent',
      textBody: body,
    };
  }

  verifyRequest(
    headers: Record<string, string>,
    _body: unknown,
  ): void {
    const token = headers['x-inbound-token'] ?? headers['authorization'];
    if (!token) {
      throw new UnauthorizedException('Missing inbound email token');
    }

    const expected = Buffer.from(this.inboundSecret);
    const received = Buffer.from(token.replace('Bearer ', ''));
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Invalid inbound email token');
    }
  }
}
