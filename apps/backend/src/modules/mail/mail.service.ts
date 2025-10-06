import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

type MailRecipientInput = {
  email: string;
  displayName?: string | null;
};

type MailSendOptions = {
  to: MailRecipientInput[];
  subject: string;
  text: string;
  html?: string | null;
  metadata?: Record<string, any> | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly webhookUrl: string | null;
  private readonly webhookToken: string | null;
  private readonly webhookTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl =
      this.configService.get<string>('MAIL_WEBHOOK_URL')?.trim() || null;
    this.webhookToken =
      this.configService.get<string>('MAIL_WEBHOOK_TOKEN')?.trim() || null;
    this.webhookTimeoutMs = this.resolveTimeout();
  }

  isEnabled(): boolean {
    return Boolean(this.webhookUrl);
  }

  async sendMail(options: MailSendOptions): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.debug(
        'MAIL_WEBHOOK_URL non configuré, envoi d’email ignoré',
      );
      return;
    }

    const sanitizedRecipients = options.to.filter((recipient) =>
      recipient?.email?.trim(),
    );

    if (!sanitizedRecipients.length) {
      this.logger.warn('Aucun destinataire fourni, email ignoré');
      return;
    }

    const payload = {
      to: sanitizedRecipients.map((recipient) => ({
        email: recipient.email.trim(),
        displayName: recipient.displayName?.trim() || null,
      })),
      subject: options.subject,
      text: options.text,
      html: options.html ?? null,
      metadata: options.metadata ?? null,
    };

    try {
      await this.dispatchWebhook(JSON.stringify(payload));
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        'Echec de l’appel webhook pour l’envoi de mail',
        err.stack ?? err.message,
      );
      throw error;
    }
  }

  private resolveTimeout(): number {
    const raw = Number(this.configService.get('MAIL_WEBHOOK_TIMEOUT_MS'));
    if (!Number.isFinite(raw) || raw <= 0) {
      return 5000;
    }
    return raw;
  }

  private dispatchWebhook(body: string): Promise<void> {
    if (!this.webhookUrl) {
      return Promise.resolve();
    }

    const target = new URL(this.webhookUrl);
    const isHttps = target.protocol === 'https:';
    const requestFactory = isHttps ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const req = requestFactory(
        {
          hostname: target.hostname,
          port: target.port ? Number(target.port) : undefined,
          path: `${target.pathname}${target.search}`,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body).toString(),
            ...(this.webhookToken
              ? { authorization: `Bearer ${this.webhookToken}` }
              : {}),
          },
        },
        (res) => {
          let responseBody = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(
                new Error(
                  `Webhook mailer a répondu ${res.statusCode ?? 0}: ${responseBody}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', reject);
      req.setTimeout(this.webhookTimeoutMs, () => {
        req.destroy(new Error('Délai dépassé pour l’appel webhook mailer'));
      });

      req.write(body);
      req.end();
    });
  }
}
