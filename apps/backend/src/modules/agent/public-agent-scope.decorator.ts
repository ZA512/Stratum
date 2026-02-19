import { SetMetadata } from '@nestjs/common';

export const PUBLIC_AGENT_SCOPE_KEY = 'publicAgentScope';

export type PublicAgentScope = 'agent:command' | 'agent:chat';

export const RequirePublicAgentScope = (scope: PublicAgentScope) =>
  SetMetadata(PUBLIC_AGENT_SCOPE_KEY, scope);