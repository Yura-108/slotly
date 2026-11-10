import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { AppConfig, loadConfig } from '../infrastructure/config/config.schema';
import { startTestDatabase, type TestDatabase } from './postgres';

export const TEST_ORIGIN = 'http://localhost:3000';

export interface TestApp {
  app: NestExpressApplication;
  database: TestDatabase;
  close: () => Promise<void>;
}

/**
 * The real AppModule with the production HTTP pipeline (configureApp) on a throwaway
 * PostgreSQL. Only the configuration source is replaced: no mocks of our own code.
 * The outbox worker loop is off; tests deliver emails explicitly via OutboxProcessor.
 */
export async function startTestApp(options: { smtpUrl?: string } = {}): Promise<TestApp> {
  const database = await startTestDatabase();
  const config = loadConfig({
    DATABASE_URL: database.connectionUri,
    APP_ORIGIN: TEST_ORIGIN,
    LOG_LEVEL: 'fatal',
    // Nothing listens there: tests that do not deliver emails never connect
    SMTP_URL: options.smtpUrl ?? 'smtp://127.0.0.1:1',
    EMAIL_FROM: 'Slotly <no-reply@slotly.test>',
    OUTBOX_POLL_INTERVAL_MS: '0',
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfig)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  return {
    app,
    database,
    close: async () => {
      await app.close();
      await database.stop();
    },
  };
}
