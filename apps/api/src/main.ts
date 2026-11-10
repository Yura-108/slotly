import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig, loadEnvFileIfPresent } from './infrastructure/config/config.schema';

async function bootstrap(): Promise<void> {
  loadEnvFileIfPresent();

  // Buffer logs until the pino logger is ready, so bootstrap logs are structured too
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app);

  await app.listen(app.get(AppConfig).port);
}

void bootstrap();
