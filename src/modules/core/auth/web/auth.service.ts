import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CreateUserRequestDto } from '../../../user/dto/create-user.request.dto';
import { UserService } from '../../../user/user.service';
import type { JwtUser } from '../shared/interfaces/jwt-user.interface';
import { RefreshTokenService } from '../shared/refresh-token.service';
import { normalizeAuthorizations } from '../shared/utils/normalize-authorizations';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.userService.findByUsername(username);
    if (!user) return null;

    if (user && (await bcrypt.compare(password, (user as any).password))) {
      const { password, ...result } = user as any;
      return result;
    }

    return null;
  }

  async login(user: any) {
    const payload = {
      actorType: 'web' as const,
      username: user.username,
      sub: user.id,
      companyId: user.company?.id ?? user.companyId ?? undefined,
      branchId: user.branch?.id ?? user.branchId ?? undefined,
      role: user.role
        ? {
            name: user.role?.name,
            authorizations: normalizeAuthorizations(user.role?.authorizations),
          }
        : undefined,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    };

    const access_token = this.jwtService.sign(payload);
    const { token: refresh_token } =
      await this.refreshTokenService.generateRefreshToken(user.id, null);

    return {
      access_token,
      refresh_token,
      user,
    };
  }

  async refresh(refreshToken: string) {
    const { token: newRefreshToken, userId } =
      await this.refreshTokenService.rotateRefreshToken(refreshToken);

    if (!userId) {
      throw new Error('Invalid refresh token state: missing userId');
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const payload = {
      actorType: 'web' as const,
      username: user.username,
      sub: user.id,
      companyId: user.companyId ?? undefined,
      branchId: user.branchId ?? undefined,
      role: user.role
        ? {
            name: user.role?.name,
            authorizations: normalizeAuthorizations(user.role?.authorizations),
          }
        : undefined,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      refresh_token: newRefreshToken,
      user,
    };
  }

  async register(dto: CreateUserRequestDto, currentUser: JwtUser) {
    return this.userService.create(dto, currentUser);
  }
}
