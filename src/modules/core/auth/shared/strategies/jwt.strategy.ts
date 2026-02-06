import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthActorType } from '../types/auth-actor.type';
import { normalizeAuthorizations } from '../utils/normalize-authorizations';

interface JwtPayload {
  sub: string;
  username: string;
  companyId?: string;
  branchId?: string;
  isSuperAdmin: boolean;
  role?: {
    name: string;
    authorizations: unknown;
  };
  actorType?: AuthActorType;
  driverId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static extractJWT(req: Request): string | null {
    if (req.cookies && 'access_token' in req.cookies) {
      return req.cookies.access_token;
    }
    return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  }

  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: JwtStrategy.extractJWT,
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const actorType: AuthActorType = payload.actorType ?? 'web';
    return {
      userId: payload.sub,
      username: payload.username,
      companyId: payload.companyId,
      branchId: payload.branchId,
      isSuperAdmin: payload.isSuperAdmin,
      actorType,
      driverId: payload.driverId,
      role: payload.role
        ? {
            name: payload.role?.name,
            authorizations: normalizeAuthorizations(
              payload.role?.authorizations,
            ),
          }
        : undefined,
    };
  }
}
