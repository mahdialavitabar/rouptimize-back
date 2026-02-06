import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RefreshTokenService } from '../shared/refresh-token.service';
import { LoginMobileUserRequestDto } from './dto/login-mobile-user.request.dto';
import { RegisterMobileUserRequestDto } from './dto/register-mobile-user.request.dto';
import { MobileAuthService } from './mobile-auth.service';

@ApiTags('auth')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(
    private readonly auth: MobileAuthService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Login for mobile users' })
  @ApiOkResponse({ description: 'JWT access token and refresh token.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  async login(@Body() dto: LoginMobileUserRequestDto) {
    const user = await this.auth.validateMobileUser(
      dto.username,
      dto.password,
      dto.companyId,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.auth.login(user);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({ description: 'New JWT access token and refresh token.' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token.' })
  async refresh(@Body() body: { refresh_token: string }) {
    if (!body.refresh_token) {
      throw new UnauthorizedException('No refresh token');
    }
    return this.auth.refresh(body.refresh_token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout mobile user' })
  async logout(@Body() body: { refresh_token: string }) {
    if (body.refresh_token) {
      await this.refreshTokenService.revokeRefreshToken(body.refresh_token);
    }
    return { success: true };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new mobile user with invite code' })
  @ApiCreatedResponse({ description: 'Mobile user created and JWT returned.' })
  @ApiBadRequestResponse({ description: 'Invalid or expired invite code.' })
  @ApiConflictResponse({ description: 'Username already exists.' })
  async register(@Body() dto: RegisterMobileUserRequestDto) {
    const user = await this.auth.registerMobileUser(dto);
    return this.auth.login(user);
  }
}
