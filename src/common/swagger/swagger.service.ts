import { INestApplication, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerConfig, SwaggerConfigOptions } from './swagger.config';

@Injectable()
export class SwaggerService {
  constructor(
    private readonly swaggerConfig: SwaggerConfig,
    private configService: ConfigService,
  ) {}

  setupSwagger(
    app: INestApplication,
    options: SwaggerConfigOptions = {},
  ): void {
    try {
      const authOptions: SwaggerConfigOptions = {};

      if (
        this.configService.get('SWAGGER_USERNAME') &&
        this.configService.get('SWAGGER_PASSWORD')
      ) {
        authOptions.username = this.configService.get('SWAGGER_USERNAME');
        authOptions.password = this.configService.get('SWAGGER_PASSWORD');
      }

      this.swaggerConfig.setup(app, { ...options, ...authOptions });
    } catch (error) {
      console.warn('Could not setup Swagger:', error);
    }
  }
}
