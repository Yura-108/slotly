import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Limits of the HTTP layer (ADR-016). They bound what one client can hold: a connection
 * that sends headers byte by byte (slowloris), a body that never ends, a huge JSON document.
 * Handler time is bounded by the database timeouts (database.module.ts), not here.
 */
export const HTTP_LIMITS = {
  /** All request headers must arrive within this time, or the server answers 408. */
  headersTimeoutMs: 10_000,
  /** The whole request, body included. Node's default is 300 s. */
  requestTimeoutMs: 30_000,
  /**
   * How often Node checks both timeouts above. Its default, 30 s, would let a slow client
   * hold a connection for up to 40 s instead of 10 (measured).
   */
  connectionsCheckingIntervalMs: 1000,
  /**
   * The largest request body. Our largest body is a specialist profile — a few KB;
   * Express's default is 100 KB, and parsing a big JSON document blocks the event loop.
   */
  bodyLimit: '32kb',
} as const;

export function applyHttpLimits(app: NestExpressApplication): void {
  const server = app.getHttpServer();
  server.headersTimeout = HTTP_LIMITS.headersTimeoutMs;
  server.requestTimeout = HTTP_LIMITS.requestTimeoutMs;
  // A createServer() option, and Nest creates the server itself. Node reads the property
  // when the server starts listening, so setting it before listen() works; it is missing
  // from the Server typings. reliability.e2e.test.ts fails if this stops working
  (server as Server & { connectionsCheckingInterval: number }).connectionsCheckingInterval =
    HTTP_LIMITS.connectionsCheckingIntervalMs;
  // keepAliveTimeout stays at Node's 5 s: the Next.js proxy (a Node client) closes idle
  // connections 1 s before the server's Keep-Alive hint. Behind a load balancer it must
  // exceed the balancer's idle timeout — stage 9

  // Registered before Nest's own parsers, which then skip json and urlencoded
  app.useBodyParser('json', { limit: HTTP_LIMITS.bodyLimit });
  // The API speaks JSON; forms are only limited, and parsed flat (no nested objects via qs)
  app.useBodyParser('urlencoded', { limit: HTTP_LIMITS.bodyLimit, extended: false });
}
