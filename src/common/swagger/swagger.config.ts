import { INestApplication, Injectable } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';

export interface SwaggerConfigOptions {
  title?: string;
  description?: string;
  version?: string;
  path?: string;
  username?: string;
  password?: string;
}

@Injectable()
export class SwaggerConfig {
  private static readonly DEFAULT_CONFIG: SwaggerConfigOptions = {
    title: 'Rouptimize API',
    description: 'Rouptimize Backend API Documentation',
    version: '1.0.0',
    path: 'swagger',
  };

  setup(app: INestApplication, options: SwaggerConfigOptions = {}): void {
    const config = { ...SwaggerConfig.DEFAULT_CONFIG, ...options };

    if (config.username && config.password) {
      app.use(
        `/${config.path}`,
        basicAuth({
          users: { [config.username]: config.password },
          challenge: true,
        }),
      );
    }

    const documentConfig = new DocumentBuilder()
      .setTitle(config.title!)
      .setDescription(config.description!)
      .setVersion(config.version!)
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup(config.path!, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        docExpansion: 'list',
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        urls: [
          {
            url: `/${config.path}/json`,
            name: 'config.title!',
          },
        ],
      },
      jsonDocumentUrl: `/${config.path}/json`,
    });
  }
}
