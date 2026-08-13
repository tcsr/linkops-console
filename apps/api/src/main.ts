import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from '@linkops/api-feature';

/**
 * M3 API bootstrap.
 *
 * Real NestJS application. NestJS owns construction, DI, and lifecycle of all
 * providers — including `TelemetrySimulatorService`, which starts on
 * `onModuleInit` and stops on `onApplicationShutdown`. `enableShutdownHooks()`
 * routes SIGTERM/SIGINT through the Nest shutdown lifecycle (timer stopped,
 * app closed) instead of an abrupt `process.exit()`.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[linkops-api] M3 REST API listening on :${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('[linkops-api] failed to start', error);
  process.exitCode = 1;
});
