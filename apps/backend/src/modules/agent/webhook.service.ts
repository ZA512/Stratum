import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebhookDeliveryStatus } from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface WebhookConfig {
  id: string;
  workspaceId: string;
  url: string;
  secret: string;
  eventTypes: string[];
  enabled: boolean;
  description?: string | null;
  createdAt: Date;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly maxRetries = 5;
  private readonly retryDelaysMs = [5_000, 30_000, 120_000, 600_000, 3600_000];

  constructor(private readonly prisma: PrismaService) {}

  async createWebhook(
    workspaceId: string,
    url: string,
    eventTypes: string[],
    description?: string,
  ): Promise<WebhookConfig> {
    const secret = randomUUID();
    const secretHash = createHash('sha256').update(secret).digest('hex');

    const webhook = await this.prisma.webhook.create({
      data: {
        workspaceId,
        url,
        secretHash,
        eventTypes,
        enabled: true,
        description: description ?? null,
      },
    });

    this.logger.log(`Webhook created: ${webhook.id} → ${url} for workspace ${workspaceId}`);

    // Return the plain-text secret only on creation (never stored plain)
    return {
      id: webhook.id,
      workspaceId: webhook.workspaceId,
      url: webhook.url,
      secret,
      eventTypes: webhook.eventTypes,
      enabled: webhook.enabled,
      description: webhook.description,
      createdAt: webhook.createdAt,
    };
  }

  async listWebhooks(workspaceId: string): Promise<WebhookConfig[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    return webhooks.map((wh) => ({
      id: wh.id,
      workspaceId: wh.workspaceId,
      url: wh.url,
      secret: '***', // Never expose secret after creation
      eventTypes: wh.eventTypes,
      enabled: wh.enabled,
      description: wh.description,
      createdAt: wh.createdAt,
    }));
  }

  async deleteWebhook(workspaceId: string, webhookId: string): Promise<void> {
    const wh = await this.prisma.webhook.findFirst({
      where: { id: webhookId, workspaceId },
    });

    if (!wh) {
      throw new NotFoundException('Webhook non trouvé');
    }

    await this.prisma.webhook.delete({ where: { id: webhookId } });
  }

  /**
   * Dispatch an event to all matching webhooks for a workspace.
   * Uses fire-and-forget with retry logic.
   */
  async dispatch(
    workspaceId: string,
    eventType: string,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const matching = await this.prisma.webhook.findMany({
      where: {
        workspaceId,
        enabled: true,
        eventTypes: { has: eventType },
      },
    });

    for (const webhook of matching) {
      // Non-blocking delivery with retry
      this.deliverWithRetry(webhook, eventId, eventType, payload, 0).catch(
        (err) =>
          this.logger.error(
            `Webhook delivery failed permanently: ${webhook.id}`,
            err,
          ),
      );
    }
  }

  private async deliverWithRetry(
    webhook: { id: string; workspaceId: string; url: string; secretHash: string },
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    attempt: number,
  ): Promise<void> {
    const body = JSON.stringify({
      eventId,
      eventType,
      workspaceId: webhook.workspaceId,
      payload,
      timestamp: new Date().toISOString(),
    });

    // Sign using the stored hash as HMAC key (secret itself is not stored)
    const signature = createHmac('sha256', webhook.secretHash)
      .update(body)
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Stratum-Signature': `sha256=${signature}`,
          'X-Stratum-Event': eventType,
          'X-Stratum-Delivery': eventId,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventId,
          eventType,
          status: response.ok
            ? WebhookDeliveryStatus.DELIVERED
            : WebhookDeliveryStatus.FAILED,
          httpStatus: response.status,
          attempt: attempt + 1,
          deliveredAt: response.ok ? new Date() : null,
        },
      });

      if (!response.ok && attempt < this.maxRetries) {
        const delay = this.retryDelaysMs[attempt] ?? 3600_000;
        this.logger.warn(
          `Webhook ${webhook.id} delivery failed (HTTP ${response.status}), retrying in ${delay}ms`,
        );
        await this.sleep(delay);
        return this.deliverWithRetry(webhook, eventId, eventType, payload, attempt + 1);
      }

      if (!response.ok) {
        await this.prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            eventId,
            eventType,
            status: WebhookDeliveryStatus.DEAD_LETTER,
            httpStatus: response.status,
            attempt: attempt + 1,
          },
        });
        this.logger.error(
          `Webhook ${webhook.id} dead-lettered after ${this.maxRetries} attempts`,
        );
      }
    } catch (error) {
      if (attempt < this.maxRetries) {
        const delay = this.retryDelaysMs[attempt] ?? 3600_000;
        this.logger.warn(
          `Webhook ${webhook.id} delivery error, retrying in ${delay}ms`,
        );
        await this.sleep(delay);
        return this.deliverWithRetry(webhook, eventId, eventType, payload, attempt + 1);
      }

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventId,
          eventType,
          status: WebhookDeliveryStatus.DEAD_LETTER,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          attempt: attempt + 1,
        },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
