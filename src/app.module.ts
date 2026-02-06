import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { join } from 'path';

import { CommonModule } from './common/common.module';
import { SwaggerModule } from './common/swagger/swagger.module';
import { BranchModule } from './modules/branch/branch.module';
import { CompanyModule } from './modules/company/company.module';
import { AuthModule } from './modules/core/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DriverModule } from './modules/driver/driver.module';
import { HealthModule } from './modules/health/health.module';
import { MissionModule } from './modules/mission/mission.module';
import { RoleModule } from './modules/roles/role.module';
import { RouteModule } from './modules/route/route.module';
import { UserModule } from './modules/user/user.module';
import { VehicleDriverAssignmentModule } from './modules/vehicle-driver-assignment/vehicle-driver-assignment.module';
import { VehicleModule } from './modules/vehicle/vehicle.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // In Docker, env vars are injected by docker-compose env_file
      // In local dev, use .env.development
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? undefined // Use process.env directly in production
          : join(__dirname, '../../../.env.development'),
      validationSchema: Joi.object({
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_DATABASE: Joi.string().required(),
        DB_POOL_MAX: Joi.number().default(10),
        DB_POOL_IDLE_TIMEOUT_MS: Joi.number().default(30000),
        DB_POOL_CONNECTION_TIMEOUT_MS: Joi.number().default(2000),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRATION: Joi.string().default('15m'),
        REFRESH_TOKEN_EXPIRATION_DAYS: Joi.number().default(7),
        FRONTEND_WEB_URL: Joi.string().uri().default('http://localhost:3000'),
        REDIS_HOST: Joi.string().default('redis'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        MQTT_URL: Joi.string().default('mqtt://mqtt:1883'),
        MQTT_USERNAME: Joi.string().allow('').optional(),
        MQTT_PASSWORD: Joi.string().allow('').optional(),
        RABBITMQ_URI: Joi.string().default('amqp://guest:guest@rabbitmq:5672'),
        RABBITMQ_PREFETCH: Joi.number().default(10),
        NODE_ENV: Joi.string()
          .valid('development', 'staging', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(4000),
        SEED_SUPER_ADMIN: Joi.string().valid('true', 'false').default('true'),
        SUPER_ADMIN_USERNAME: Joi.string().default('superadmin'),
        SUPER_ADMIN_PASSWORD: Joi.string().default('superadminpassword'),
        SUPER_ADMIN_EMAIL: Joi.string()
          .email()
          .default('superadmin@example.com'),
      }),
    }),
    CommonModule,
    SwaggerModule,
    HealthModule,
    AuthModule,
    UserModule,
    CompanyModule,
    RoleModule,
    BranchModule,
    VehicleModule,
    DriverModule,
    VehicleDriverAssignmentModule,
    MissionModule,
    RouteModule,
    DashboardModule,
  ],
})
export class AppModule {}
