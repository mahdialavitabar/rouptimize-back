import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CompanyBalanceService } from '../modules/core/company-balance/company-balance.service';
import { DatabaseModule } from './database/database.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { RedisModule } from './redis/redis.module';
import { RequestContextInterceptor } from './request-context/request-context.interceptor';
import { RequestContextService } from './request-context/request-context.service';
import { SeederModule } from './seeder/seeder.module';
import { VroomModule } from './vroom/vroom.module';
const modules = [
  DatabaseModule,
  RabbitmqModule,
  RedisModule,
  SeederModule,
  VroomModule,
];

@Global()
@Module({
  imports: modules,
  exports: [...modules, RequestContextService, CompanyBalanceService],
  providers: [
    RequestContextService,
    CompanyBalanceService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
})
export class CommonModule {}
