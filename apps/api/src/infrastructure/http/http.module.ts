import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { OriginGuard } from './origin.guard';
import { ProblemDetailsFilter } from './problem-details.filter';
import { DEFAULT_RATE_LIMIT } from './rate-limits';

/**
 * Cross-cutting HTTP behaviour shared by all modules. Imported before feature modules,
 * so its global guards run first: Origin check → rate limit → session (auth module).
 */
@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [DEFAULT_RATE_LIMIT] })],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Request bodies, params and queries are validated against their Zod DTOs
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Responses are parsed by their Zod schema: undeclared fields (passwordHash…) never leave
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class HttpModule {}
