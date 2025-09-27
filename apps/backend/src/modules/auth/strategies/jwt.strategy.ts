import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { JwtFromRequestFunction, StrategyOptions } from 'passport-jwt';
import type { Request } from 'express';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const jwtFromRequest: JwtFromRequestFunction = (req: Request) => {
      const header = req.headers.authorization;
      if (typeof header !== 'string') {
        return null;
      }
      const [scheme, token] = header.split(' ');
      if (!token || scheme.toLowerCase() !== 'bearer') {
        return null;
      }
      return token;
    };

    const options: StrategyOptions = {
      jwtFromRequest,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    };

    super(options);
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
    };
  }
}
