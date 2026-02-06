import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenService } from '../shared/refresh-token.service';
import { normalizeAuthorizations } from '../shared/utils/normalize-authorizations';
import { RegisterMobileUserRequestDto } from './dto/register-mobile-user.request.dto';
import { MobileUserService } from './mobile-user.service';

@Injectable()
export class MobileAuthService {
  constructor(
    private readonly mobileUsers: MobileUserService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async validateMobileUser(
    username: string,
    password: string,
    companyId?: string,
  ) {
    return this.mobileUsers.validateMobileUser(username, password, companyId);
  }

  async findByUsernameAndCompany(username: string, companyId: string) {
    return this.mobileUsers.findByUsernameAndCompany(username, companyId);
  }

  async registerMobileUser(dto: RegisterMobileUserRequestDto) {
    return this.mobileUsers.createMobileUser(dto);
  }

  async login(mobileUser: any) {
    // Check if user is blocked
    if (mobileUser.isBlocked) {
      throw new UnauthorizedException(
        'Your account has been blocked. Please contact your administrator.',
      );
    }

    // Get permissions from the mobile user's permissions field or role
    const permissionsFromDb = mobileUser.permissions
      ? mobileUser.permissions.split(',').filter(Boolean)
      : [];

    const permissionsFromRole = mobileUser.role
      ? normalizeAuthorizations(mobileUser.role?.authorizations)
      : [];

    // Combine permissions (prefer DB permissions, fallback to role)
    const authorizations =
      permissionsFromDb.length > 0 ? permissionsFromDb : permissionsFromRole;

    const payload = {
      actorType: 'mobile' as const,
      username: mobileUser.username,
      sub: mobileUser.id,
      companyId: mobileUser.company?.id ?? mobileUser.companyId ?? undefined,
      branchId: mobileUser.branch?.id ?? mobileUser.branchId ?? undefined,
      driverId: mobileUser.driver?.id ?? mobileUser.driverId ?? undefined,
      role: {
        name: mobileUser.role?.name ?? 'mobile_user',
        authorizations,
      },
      isSuperAdmin: Boolean(mobileUser.isSuperAdmin),
    };

    const access_token = this.jwtService.sign(payload);
    const { token: refresh_token } =
      await this.refreshTokenService.generateRefreshToken(null, mobileUser.id);

    return {
      access_token,
      refresh_token,
    };
  }

  async refresh(refreshToken: string) {
    const { token: newRefreshToken, mobileUserId } =
      await this.refreshTokenService.rotateRefreshToken(refreshToken);

    if (!mobileUserId) {
      throw new Error('Invalid refresh token state: missing mobileUserId');
    }

    const mobileUser = await this.mobileUsers.findById(mobileUserId);
    if (!mobileUser) {
      throw new Error('Mobile user not found');
    }

    // Check if user is blocked
    if (mobileUser.isBlocked) {
      throw new UnauthorizedException(
        'Your account has been blocked. Please contact your administrator.',
      );
    }

    // Get permissions from the mobile user's permissions field or role
    const permissionsFromDb = mobileUser.permissions
      ? mobileUser.permissions.split(',').filter(Boolean)
      : [];

    const permissionsFromRole = mobileUser.role
      ? normalizeAuthorizations(mobileUser.role?.authorizations)
      : [];

    // Combine permissions (prefer DB permissions, fallback to role)
    const authorizations =
      permissionsFromDb.length > 0 ? permissionsFromDb : permissionsFromRole;

    const payload = {
      actorType: 'mobile' as const,
      username: mobileUser.username,
      sub: mobileUser.id,
      companyId: mobileUser.company?.id ?? mobileUser.companyId ?? undefined,
      branchId: mobileUser.branch?.id ?? mobileUser.branchId ?? undefined,
      driverId: mobileUser.driver?.id ?? mobileUser.driverId ?? undefined,
      role: {
        name: mobileUser.role?.name ?? 'mobile_user',
        authorizations,
      },
      isSuperAdmin: Boolean(mobileUser.isSuperAdmin),
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      refresh_token: newRefreshToken,
    };
  }
}
