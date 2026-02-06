import { Module } from '@nestjs/common';
import { SwaggerConfig } from './swagger.config';
import { SwaggerService } from './swagger.service';

@Module({
  providers: [SwaggerService, SwaggerConfig],
  exports: [SwaggerService, SwaggerConfig],
})
export class SwaggerModule {}
