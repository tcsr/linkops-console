import {
  InMemoryLinkRepository,
  TelemetrySimulatorService,
  createSeedLinks,
} from '@linkops/api-data-access';

/**
 * M2 composition shell.
 *
 * There is still no HTTP server (REST arrives in M3). This entry point composes
 * the domain + data-access layers, seeds the fleet, and starts the 1 Hz
 * telemetry simulator so ring buffers begin filling and derived status becomes
 * meaningful. The Nx dependency boundaries are exercised: `apps/api` (scope:api)
 * → `@linkops/api-data-access` → `@linkops/domain`.
 */
async function main(): Promise<void> {
  const repository = new InMemoryLinkRepository({ seed: createSeedLinks() });
  const links = await repository.list({});

  const simulator = new TelemetrySimulatorService(repository);
  simulator.start();

  console.log(
    `[linkops-api] M2 shell ready — seeded ${links.length} links; telemetry simulator running at 1 Hz (no HTTP server yet).`,
  );

  // Clean lifecycle: stop the single interval on shutdown signals.
  const shutdown = (signal: string): void => {
    console.log(`[linkops-api] ${signal} received — stopping simulator.`);
    simulator.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('[linkops-api] failed to start', error);
  process.exitCode = 1;
});
