import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtUser } from '../interfaces/jwt-user.interface';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user: JwtUser = request.user;

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    if (user?.isSuperAdmin) {
      return true;
    }

    // Allow mobile users to read and update their own profile
    if (
      user?.actorType === 'mobile' &&
      (context.getHandler().name === 'update' ||
        context.getHandler().name === 'findOne')
    ) {
      const id = request.params.id;
      if (user.userId === id) {
        return true;
      }
    }

    if (!user?.role || !user.role.authorizations) {
      throw new ForbiddenException('Forbidden resource');
    }

    const userPermissions = user.role.authorizations;
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Forbidden resource');
    }

    return true;
  }
}
