import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnvFileIfPresent } from './infrastructure/config/config.schema';
import { createOpenApiDocument } from './openapi';

/**
 * Writes apps/api/openapi.json — committed, so every contract change shows up in PR diffs;
 * CI regenerates it and fails on a difference (api.md §5). The app is created but never
 * listens and never queries the database; configuration must still be valid (.env or env vars).
 */
async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  const document = createOpenApiDocument(app);
  const target = join(__dirname, '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI written to ${target}`);
}

void main();
