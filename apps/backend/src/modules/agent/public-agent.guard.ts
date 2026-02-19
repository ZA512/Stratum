import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PUBLIC_AGENT_SCOPE_KEY,
  PublicAgentScope,
} from './public-agent-scope.decorator';
import {
  PublicAgentAccessService,
  PublicAgentAuthContext,
} from './public-agent-access.service';

interface PublicAgentRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: { workspaceId?: unknown };
  publicAgentAuth?: PublicAgentAuthContext;
}

@Injectable()
export class PublicAgentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessService: PublicAgentAccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.get<PublicAgentScope>(
      PUBLIC_AGENT_SCOPE_KEY,
      context.getHandler(),
    );

    if (!requiredScope) {
      throw new UnauthorizedException({
        code: 'PUBLIC_AGENT_SCOPE_NOT_CONFIGURED',
        message: 'Missing endpoint scope metadata',
      });
    }

    const req = context.switchToHttp().getRequest<PublicAgentRequest>();
    const workspaceId = this.readWorkspaceId(req);
    const bearer = this.readBearerToken(req.headers.authorization);

    req.publicAgentAuth = this.accessService.authenticate(
      bearer,
      workspaceId,
      requiredScope,
    );

    return true;
  }

  private readWorkspaceId(req: PublicAgentRequest): string {
    const workspaceId = req.body?.workspaceId;
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new UnauthorizedException({
        code: 'PUBLIC_AGENT_WORKSPACE_REQUIRED',
        message: 'workspaceId is required in request body',
      });
    }
    return workspaceId;
  }

  private readBearerToken(
    authorizationHeader: string | string[] | undefined,
  ): string | undefined {
    const raw =
      typeof authorizationHeader === 'string'
        ? authorizationHeader
        : Array.isArray(authorizationHeader)
          ? authorizationHeader[0]
          : undefined;

    if (!raw) return undefined;
    const [scheme, token] = raw.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException({
        code: 'PUBLIC_AGENT_AUTH_HEADER_INVALID',
        message: 'Authorization header must be Bearer <token>',
      });
    }
    return token;
  }
}