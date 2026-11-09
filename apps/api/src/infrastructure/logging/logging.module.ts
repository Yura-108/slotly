import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/config.schema';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.log.level,
          transport: config.log.format === 'pretty' ? { target: 'pino-pretty' } : undefined,
          // Every log line of the request carries this id; it is also returned to the client
          genReqId: (_req, res) => {
            const id = randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          // Bodies are never logged; credentials in headers are masked (ADR-008)
          redact: {
            paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
