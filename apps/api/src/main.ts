import { InMemoryLinkRepository, createSeedLinks } from '@linkops/api-data-access';

/**
 * M1 composition shell.
 *
 * There is no HTTP server yet (REST arrives in M3). This entry point only
 * proves that the app can compose the domain + data-access layers and load the
 * deterministic seed fleet. It also exercises the Nx dependency boundaries:
 * `apps/api` (scope:api) depends on `@linkops/api-data-access` -> `@linkops/domain`.
 */
async function main(): Promise<void> {
  const repository = new InMemoryLinkRepository({ seed: createSeedLinks() });
  const links = await repository.list({});
  console.log(
    `[linkops-api] M1 shell ready — seeded ${links.length} links (no HTTP server yet).`,
  );
}

main().catch((error: unknown) => {
  console.error('[linkops-api] failed to start', error);
  process.exitCode = 1;
});
