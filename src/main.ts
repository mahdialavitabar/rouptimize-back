import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';
import { SwaggerService } from './common/swagger/swagger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  const configService = app.get(ConfigService);

  const PORT = configService.get<number>('PORT') || 4000;
  const FRONTEND_WEB_URL =
    configService.get<string>('FRONTEND_WEB_URL') || 'http://localhost:3000';
  const CORS_ORIGINS = configService.get<string>('CORS_ORIGINS') || '';

  // Build allowed origins list
  const allowedOrigins = [
    FRONTEND_WEB_URL,
    // Add any additional origins from CORS_ORIGINS env var (comma-separated)
    ...CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ];

  // Regex to match Vercel preview deployment URLs for the frontend
  const vercelPreviewRegex =
    /^https:\/\/rouptimize-front(-[a-z0-9]+)*\.vercel\.app$/;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow specific origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow Vercel preview deployments
      if (vercelPreviewRegex.test(origin)) return callback(null, true);
      // Log rejected origin for debugging
      console.warn(
        `CORS rejected origin: ${origin}. Allowed: ${allowedOrigins.join(
          ', ',
        )} + Vercel previews`,
      );
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerService = app.get(SwaggerService);
  swaggerService.setupSwagger(app);

  await app.startAllMicroservices();

  await app.listen(PORT, '0.0.0.0');
  console.log(`API running on http://0.0.0.0:${PORT}`);
}
bootstrap();
