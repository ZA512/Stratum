import {
  ForbiddenException,
  TooManyRequestsException,
  UnauthorizedException,
} from '@nestjs/common';
import { PublicAgentAccessService } from './public-agent-access.service';

describe('PublicAgentAccessService', () => {
  const originalEnabled = process.env.AGENT_PUBLIC_API_ENABLED;
  const originalTokens = process.env.AGENT_PUBLIC_TOKENS;

  afterEach(() => {
    process.env.AGENT_PUBLIC_API_ENABLED = originalEnabled;
    process.env.AGENT_PUBLIC_TOKENS = originalTokens;
  });

  it('authenticates valid token with workspace/scope and returns auth context', () => {
    process.env.AGENT_PUBLIC_API_ENABLED = 'true';
    process.env.AGENT_PUBLIC_TOKENS = JSON.stringify([
      {
        id: 'token-1',
        token: 'secret-token-1',
        workspaceId: 'workspace-1',
        scopes: ['agent:command', 'agent:chat'],
        maxRequestsPerMinute: 10,
      },
    ]);

    const service = new PublicAgentAccessService();
    const auth = service.authenticate(
      'secret-token-1',
      'workspace-1',
      'agent:command',
    );

    expect(auth.tokenId).toBe('token-1');
    expect(auth.workspaceId).toBe('workspace-1');
    expect(auth.scopes).toContain('agent:chat');
  });

  it('rejects request when public API is disabled', () => {
    process.env.AGENT_PUBLIC_API_ENABLED = 'false';
    process.env.AGENT_PUBLIC_TOKENS = JSON.stringify([]);

    const service = new PublicAgentAccessService();

    expect(() =>
      service.authenticate('any-token', 'workspace-1', 'agent:chat'),
    ).toThrow(ForbiddenException);
  });

  it('rejects workspace mismatch and missing scope', () => {
    process.env.AGENT_PUBLIC_API_ENABLED = 'true';
    process.env.AGENT_PUBLIC_TOKENS = JSON.stringify([
      {
        id: 'token-2',
        token: 'secret-token-2',
        workspaceId: 'workspace-2',
        scopes: ['agent:chat'],
      },
    ]);

    const service = new PublicAgentAccessService();

    expect(() =>
      service.authenticate('secret-token-2', 'workspace-1', 'agent:chat'),
    ).toThrow(ForbiddenException);

    expect(() =>
      service.authenticate('secret-token-2', 'workspace-2', 'agent:command'),
    ).toThrow(ForbiddenException);
  });

  it('enforces per-token rate limit', () => {
    process.env.AGENT_PUBLIC_API_ENABLED = 'true';
    process.env.AGENT_PUBLIC_TOKENS = JSON.stringify([
      {
        id: 'token-3',
        token: 'secret-token-3',
        workspaceId: 'workspace-3',
        scopes: ['agent:chat'],
        maxRequestsPerMinute: 1,
      },
    ]);

    const service = new PublicAgentAccessService();
    service.authenticate('secret-token-3', 'workspace-3', 'agent:chat');

    expect(() =>
      service.authenticate('secret-token-3', 'workspace-3', 'agent:chat'),
    ).toThrow(TooManyRequestsException);
  });

  it('rejects unknown token', () => {
    process.env.AGENT_PUBLIC_API_ENABLED = 'true';
    process.env.AGENT_PUBLIC_TOKENS = JSON.stringify([
      {
        id: 'token-4',
        token: 'secret-token-4',
        workspaceId: 'workspace-4',
        scopes: ['agent:chat'],
      },
    ]);

    const service = new PublicAgentAccessService();

    expect(() =>
      service.authenticate('wrong-token', 'workspace-4', 'agent:chat'),
    ).toThrow(UnauthorizedException);
  });
});