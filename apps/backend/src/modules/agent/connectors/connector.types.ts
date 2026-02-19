/**
 * AN-P2-02: Connector abstraction for external channels (Slack, Email, CLI).
 * Each connector translates inbound messages into agent command/chat payloads
 * and formats agent responses back to the channel's native format.
 */

export type ConnectorChannel = 'slack' | 'email' | 'cli' | 'webhook';

export interface InboundConnectorMessage {
  channel: ConnectorChannel;
  channelMessageId: string;
  workspaceId: string;
  senderExternalId: string;
  text: string;
  metadata?: Record<string, unknown>;
  receivedAt: Date;
}

export interface OutboundConnectorMessage {
  channel: ConnectorChannel;
  channelMessageId?: string;
  text: string;
  proposalId?: string;
  proposalUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorAdapter {
  readonly channel: ConnectorChannel;

  /**
   * Parse an inbound webhook/request payload into a normalized message.
   * Returns null if the payload should be ignored (e.g. bot message, retry).
   */
  parseInbound(payload: unknown): InboundConnectorMessage | null;

  /**
   * Format an agent response into the channel-native outbound payload.
   */
  formatOutbound(message: OutboundConnectorMessage): unknown;

  /**
   * Verify the authenticity of an inbound request (signature, token, etc.).
   * Throws UnauthorizedException if verification fails.
   */
  verifyRequest(headers: Record<string, string>, body: unknown): void;
}
