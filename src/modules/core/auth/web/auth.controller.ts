import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import ms, { StringValue } from 'ms';
import { CreateUserRequestDto } from '../../../user/dto/create-user.request.dto';
import { LoginRequestDto } from './dto/login.request.dto';

import { CurrentUser } from '../shared/decorators/current-user.decorator';
import type { JwtUser } from '../shared/interfaces/jwt-user.interface';
import { RefreshTokenService } from '../shared/refresh-token.service';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly configService: ConfigService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: JwtUser) {
    return user;
  }

  @Post('login')
  @ApiOkResponse({ description: 'User profile (tokens in cookies).' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  async login(
    @Body() body: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      body.username,
      body.password,
    );
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const {
      access_token,
      refresh_token,
      user: userData,
    } = await this.authService.login(user);

    this.setCookies(res, access_token, refresh_token);

    return userData;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    try {
      const { access_token, refresh_token } =
        await this.authService.refresh(refreshToken);
      this.setCookies(res, access_token, refresh_token);
      return { success: true };
    } catch (e) {
      const domain = this.configService.get('COOKIE_DOMAIN');
      const options = { domain, path: '/' };
      res.clearCookie('access_token', options);
      res.clearCookie('refresh_token', options);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    if (refreshToken) {
      await this.refreshTokenService.revokeRefreshToken(refreshToken);
    }

    const domain = this.configService.get('COOKIE_DOMAIN');
    const options = { domain, path: '/' };

    res.clearCookie('access_token', options);
    res.clearCookie('refresh_token', options);

    return { success: true };
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    const domain = this.configService.get('COOKIE_DOMAIN');
    const sameSite = this.configService.get('COOKIE_SAME_SITE', 'Lax');
    const isProd = process.env.NODE_ENV === 'production';
    const jwtExpiration = this.configService.get<string>(
      'JWT_EXPIRATION',
      '15m',
    );
    const refreshTokenExpirationDays = this.configService.get<number>(
      'REFRESH_TOKEN_EXPIRATION_DAYS',
      7,
    );

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSite as any,
      domain,
      path: '/',
      maxAge: ms(jwtExpiration as StringValue),
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSite as any,
      domain,
      path: '/',
      maxAge: refreshTokenExpirationDays * 24 * 60 * 60 * 1000,
    });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user (requires permission)' })
  @ApiBearerAuth()
  async register(
    @Body() dto: CreateUserRequestDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    return this.authService.register(dto, currentUser);
  }
}
