import {
  ForbiddenException,
  Injectable,
  TooManyRequestsException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PublicAgentScope } from './public-agent-scope.decorator';

export interface PublicAgentAuthContext {
  tokenId: string;
  workspaceId: string;
  scopes: PublicAgentScope[];
}

interface TokenConfig {
  id: string;
  token: string;
  workspaceId: string;
  scopes: PublicAgentScope[];
  maxRequestsPerMinute: number;
  enabled: boolean;
}

interface ParsedTokenConfig {
  id: string;
  tokenHash: Buffer;
  workspaceId: string;
  scopes: Set<PublicAgentScope>;
  maxRequestsPerMinute: number;
  enabled: boolean;
}

@Injectable()
export class PublicAgentAccessService {
  private readonly tokenConfigs: ParsedTokenConfig[];
  private readonly requestsByToken = new Map<string, number[]>();

  constructor() {
    this.tokenConfigs = this.parseTokensFromEnv();
  }

  assertEnabled(): void {
    if (process.env.AGENT_PUBLIC_API_ENABLED !== 'true') {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: 'Public Agent API disabled',
      });
    }
  }

  authenticate(
    bearerToken: string | undefined,
    workspaceId: string,
    requiredScope: PublicAgentScope,
  ): PublicAgentAuthContext {
    this.assertEnabled();

    if (!bearerToken) {
      throw new UnauthorizedException({
        code: 'PUBLIC_AGENT_TOKEN_MISSING',
        message: 'Missing bearer token',
      });
    }

    const config = this.findTokenConfig(bearerToken);
    if (!config || !config.enabled) {
      throw new UnauthorizedException({
        code: 'PUBLIC_AGENT_TOKEN_INVALID',
        message: 'Invalid public token',
      });
    }

    if (config.workspaceId !== workspaceId) {
      throw new ForbiddenException({
        code: 'PUBLIC_AGENT_SCOPE_WORKSPACE_MISMATCH',
        message: 'Token is not allowed for this workspace',
      });
    }

    if (!config.scopes.has(requiredScope)) {
      throw new ForbiddenException({
        code: 'PUBLIC_AGENT_SCOPE_MISSING',
        message: `Missing required scope: ${requiredScope}`,
      });
    }

    this.enforceRateLimit(config.id, config.maxRequestsPerMinute);

    return {
      tokenId: config.id,
      workspaceId: config.workspaceId,
      scopes: Array.from(config.scopes),
    };
  }

  private parseTokensFromEnv(): ParsedTokenConfig[] {
    const raw = process.env.AGENT_PUBLIC_TOKENS;
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as TokenConfig[];
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.token === 'string' &&
            typeof item.workspaceId === 'string' &&
            Array.isArray(item.scopes),
        )
        .map((item) => ({
          id: item.id,
          tokenHash: this.hashToken(item.token),
          workspaceId: item.workspaceId,
          scopes: new Set(
            item.scopes.filter(
              (scope): scope is PublicAgentScope =>
                scope === 'agent:command' || scope === 'agent:chat',
            ),
          ),
          maxRequestsPerMinute:
            Number.isFinite(item.maxRequestsPerMinute) &&
            item.maxRequestsPerMinute > 0
              ? item.maxRequestsPerMinute
              : 60,
          enabled: item.enabled !== false,
        }));
    } catch {
      return [];
    }
  }

  private findTokenConfig(token: string): ParsedTokenConfig | undefined {
    const tokenHash = this.hashToken(token);
    return this.tokenConfigs.find((config) =>
      this.safeCompare(config.tokenHash, tokenHash),
    );
  }

  private hashToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }

  private safeCompare(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private enforceRateLimit(tokenId: string, maxPerMinute: number): void {
    const now = Date.now();
    const cutoff = now - 60_000;
    const current = this.requestsByToken.get(tokenId) ?? [];
    const inWindow = current.filter((timestamp) => timestamp >= cutoff);

    if (inWindow.length >= maxPerMinute) {
      this.requestsByToken.set(tokenId, inWindow);
      throw new TooManyRequestsException({
        code: 'PUBLIC_AGENT_RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded (${maxPerMinute}/minute)`,
      });
    }

    inWindow.push(now);
    this.requestsByToken.set(tokenId, inWindow);
  }
}