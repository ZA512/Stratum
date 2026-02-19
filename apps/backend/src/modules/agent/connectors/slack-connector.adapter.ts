import {
  ConnectorAdapter,
  InboundConnectorMessage,
  OutboundConnectorMessage,
} from './connector.types';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface SlackEvent {
  type: string;
  event?: {
    type: string;
    user: string;
    text: string;
    ts: string;
    channel: string;
    bot_id?: string;
  };
  challenge?: string;
}

export class SlackConnectorAdapter implements ConnectorAdapter {
  readonly channel = 'slack' as const;

  private readonly signingSecret: string;

  constructor(signingSecret: string) {
    this.signingSecret = signingSecret;
  }

  parseInbound(payload: unknown): InboundConnectorMessage | null {
    const data = payload as SlackEvent;

    // Ignore non-message events and bot messages
    if (
      data.type !== 'event_callback' ||
      !data.event ||
      data.event.type !== 'message' ||
      data.event.bot_id
    ) {
      return null;
    }

    // Extract workspace ID from channel metadata (configured per channel)
    // In production, this would be mapped via a channel→workspace config table
    const workspaceId = `slack_channel:${data.event.channel}`;

    return {
      channel: 'slack',
      channelMessageId: data.event.ts,
      workspaceId,
      senderExternalId: data.event.user,
      text: data.event.text,
      metadata: { channel: data.event.channel },
      receivedAt: new Date(),
    };
  }

  formatOutbound(message: OutboundConnectorMessage): unknown {
    const blocks: unknown[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: message.text },
      },
    ];

    if (message.proposalId && message.proposalUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Voir la proposition' },
            url: message.proposalUrl,
            action_id: `view_proposal_${message.proposalId}`,
          },
        ],
      });
    }

    return { blocks };
  }

  verifyRequest(
    headers: Record<string, string>,
    body: unknown,
  ): void {
    const timestamp = headers['x-slack-request-timestamp'];
    const signature = headers['x-slack-signature'];

    if (!timestamp || !signature) {
      throw new UnauthorizedException('Missing Slack signature headers');
    }

    // Reject requests older than 5 minutes to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      throw new UnauthorizedException('Slack request too old');
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const sigBaseString = `v0:${timestamp}:${bodyStr}`;
    const hmac = createHmac('sha256', this.signingSecret)
      .update(sigBaseString)
      .digest('hex');
    const computedSignature = `v0=${hmac}`;

    const a = Buffer.from(signature);
    const b = Buffer.from(computedSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }
  }
}
