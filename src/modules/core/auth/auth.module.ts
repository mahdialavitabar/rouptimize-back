import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { StringValue } from 'ms';
import { UserModule } from '../../user/user.module';
import { MobileAuthController } from './mobile/mobile-auth.controller';
import { MobileAuthService } from './mobile/mobile-auth.service';
import { MobileUserRepository } from './mobile/mobile-user.repository';
import { MobileUserService } from './mobile/mobile-user.service';
import { RefreshTokenService } from './shared/refresh-token.service';
import { JwtStrategy } from './shared/strategies/jwt.strategy';
import { AuthController } from './web/auth.controller';
import { AuthService } from './web/auth.service';

@Module({
  imports: [
    UserModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET is not defined in environment variables');
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: configService.get<string>(
              'JWT_EXPIRATION',
              '15m',
            ) as StringValue,
          },
        };
      },
    }),
  ],
  providers: [
    AuthService,
    MobileAuthService,
    MobileUserService,
    MobileUserRepository,
    JwtStrategy,
    RefreshTokenService,
  ],
  controllers: [AuthController, MobileAuthController],
  exports: [
    AuthService,
    MobileAuthService,
    RefreshTokenService,
    MobileUserRepository,
  ],
})
export class AuthModule {}
