import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './config.schema';

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadConfig(process.env) }],
  exports: [AppConfig],
})
export class ConfigModule {}
