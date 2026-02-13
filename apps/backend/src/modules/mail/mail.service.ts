import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

type MailRecipientInput = {
  email: string;
  displayName?: string | null;
};

type MailIdentityInput = {
  email: string;
  name?: string | null;
};

type MailSendOptions = {
  to: MailRecipientInput[];
  subject: string;
  text: string;
  html?: string | null;
  metadata?: Record<string, any> | null;
  from?: MailIdentityInput | null;
  replyTo?: MailIdentityInput | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: 'brevo' | 'webhook' | 'disabled';
  private readonly webhookUrl: string | null;
  private readonly webhookToken: string | null;
  private readonly brevoApiKey: string | null;
  private readonly defaultSender: MailIdentityInput | null;
  private readonly defaultReplyTo: MailIdentityInput | null;
  private readonly requestTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl =
      this.configService.get<string>('MAIL_WEBHOOK_URL')?.trim() || null;
    this.webhookToken =
      this.configService.get<string>('MAIL_WEBHOOK_TOKEN')?.trim() || null;
    this.brevoApiKey =
      this.configService.get<string>('BREVO_API_KEY')?.trim() || null;
    this.defaultSender = this.resolveIdentity(
      this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() ||
        'noreply@jateroka.fr',
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() || 'Stratum',
    );
    this.defaultReplyTo = this.resolveIdentity(
      this.configService.get<string>('MAIL_REPLY_TO_EMAIL')?.trim() || null,
      this.configService.get<string>('MAIL_REPLY_TO_NAME')?.trim() || null,
    );
    this.requestTimeoutMs = this.resolveTimeout();
    this.provider = this.resolveProvider();
  }

  isEnabled(): boolean {
    return this.provider !== 'disabled';
  }

  async sendMail(options: MailSendOptions): Promise<void> {
    if (this.provider === 'disabled') {
      this.logger.debug('Envoi d’email désactivé (provider manquant).');
      return;
    }

    const sanitizedRecipients = options.to.filter((recipient) =>
      recipient?.email?.trim(),
    );

    if (!sanitizedRecipients.length) {
      this.logger.warn('Aucun destinataire fourni, email ignoré');
      return;
    }

    const sender = this.resolveSender(options.from);
    if (!sender) {
      this.logger.warn('Aucun expéditeur configuré, email ignoré');
      return;
    }
    const replyTo = this.resolveReplyTo(options.replyTo);

    const payload = {
      to: sanitizedRecipients.map((recipient) => ({
        email: recipient.email.trim(),
        displayName: recipient.displayName?.trim() || null,
      })),
      subject: options.subject,
      text: options.text,
      html: options.html ?? null,
      metadata: options.metadata ?? null,
      from: sender,
      replyTo: replyTo ?? null,
    };

    try {
      if (this.provider === 'brevo') {
        await this.dispatchBrevo(
          this.buildBrevoPayload(payload, sender, replyTo),
        );
        return;
      }

      await this.dispatchWebhook(JSON.stringify(payload));
    } catch (error) {
      const err = error as Error;
      this.logger.error("Echec de l'envoi de mail", err.stack ?? err.message);
      throw error;
    }
  }

  private resolveTimeout(): number {
    const raw = Number(
      this.configService.get('MAIL_TIMEOUT_MS') ??
        this.configService.get('MAIL_WEBHOOK_TIMEOUT_MS'),
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return 5000;
    }
    return raw;
  }

  private resolveProvider(): 'brevo' | 'webhook' | 'disabled' {
    const raw = this.configService.get<string>('MAIL_PROVIDER')?.trim();
    const normalized = raw?.toLowerCase() || '';
    if (normalized === 'brevo') {
      if (!this.brevoApiKey) {
        this.logger.warn('MAIL_PROVIDER=brevo sans BREVO_API_KEY.');
        return 'disabled';
      }
      return 'brevo';
    }
    if (normalized === 'webhook') {
      if (!this.webhookUrl) {
        this.logger.warn('MAIL_PROVIDER=webhook sans MAIL_WEBHOOK_URL.');
        return 'disabled';
      }
      return 'webhook';
    }
    if (this.brevoApiKey) {
      return 'brevo';
    }
    if (this.webhookUrl) {
      return 'webhook';
    }
    return 'disabled';
  }

  private resolveIdentity(
    email: string | null,
    name: string | null,
  ): MailIdentityInput | null {
    if (!email) return null;
    const trimmed = email.trim();
    if (!trimmed) return null;
    return { email: trimmed, name: name?.trim() || null };
  }

  private resolveSender(
    requested?: MailIdentityInput | null,
  ): MailIdentityInput | null {
    if (requested?.email?.trim()) {
      return {
        email: requested.email.trim(),
        name: requested.name?.trim() || null,
      };
    }
    return this.defaultSender;
  }

  private resolveReplyTo(
    requested?: MailIdentityInput | null,
  ): MailIdentityInput | null {
    if (requested?.email?.trim()) {
      return {
        email: requested.email.trim(),
        name: requested.name?.trim() || null,
      };
    }
    return this.defaultReplyTo;
  }

  private buildBrevoPayload(
    payload: {
      to: Array<{ email: string; displayName: string | null }>;
      subject: string;
      text: string;
      html: string | null;
      metadata: Record<string, any> | null;
    },
    sender: MailIdentityInput,
    replyTo: MailIdentityInput | null,
  ): string {
    const brevoPayload: Record<string, any> = {
      sender: {
        email: sender.email,
        name: sender.name ?? undefined,
      },
      to: payload.to.map((recipient) => ({
        email: recipient.email,
        name: recipient.displayName ?? undefined,
      })),
      subject: payload.subject,
      textContent: payload.text,
    };

    if (payload.html) {
      brevoPayload.htmlContent = payload.html;
    }
    if (replyTo) {
      brevoPayload.replyTo = {
        email: replyTo.email,
        name: replyTo.name ?? undefined,
      };
    }
    if (payload.metadata) {
      brevoPayload.tags = Object.keys(payload.metadata).slice(0, 5);
      brevoPayload.headers = {
        'X-Stratum-Metadata': JSON.stringify(payload.metadata),
      };
    }

    return JSON.stringify(brevoPayload);
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
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
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
      req.setTimeout(this.requestTimeoutMs, () => {
        req.destroy(new Error('Délai dépassé pour l’appel webhook mailer'));
      });

      req.write(body);
      req.end();
    });
  }

  private dispatchBrevo(body: string): Promise<void> {
    if (!this.brevoApiKey) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: 'api.brevo.com',
          path: '/v3/smtp/email',
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body).toString(),
            'api-key': this.brevoApiKey,
          },
        },
        (res) => {
          let responseBody = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              resolve();
            } else {
              reject(
                new Error(
                  `Brevo a répondu ${res.statusCode ?? 0}: ${responseBody}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', reject);
      req.setTimeout(this.requestTimeoutMs, () => {
        req.destroy(new Error("Délai dépassé pour l'appel Brevo"));
      });

      req.write(body);
      req.end();
    });
  }
}
