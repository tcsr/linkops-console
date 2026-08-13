import {
  deriveLinkStatus,
  type CreateLinkInput,
  type Link,
  type LinkRepository,
  type LinkStatus,
} from '@linkops/domain';
import { InMemoryLinkRepository } from './in-memory-link-repository.js';
import { createSeedLinks } from './seed-links.js';
import {
  SIMULATOR_DEFAULTS,
  TelemetrySimulatorService,
} from './telemetry-simulator.js';

const FIXED_MS = Date.parse('2025-06-01T00:00:00.000Z');
const NOW = new Date(FIXED_MS);

/** Deterministic constant RNG. */
const constRandom = (v: number) => () => v;

/** Deterministic cycling RNG (varies values tick-to-tick without triggering degradation). */
function cyclingRandom(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length];
}

function repoWith(links: Link[], random: () => number): {
  repo: InMemoryLinkRepository;
  sim: TelemetrySimulatorService;
} {
  const repo = new InMemoryLinkRepository({ seed: links, clock: () => FIXED_MS });
  const sim = new TelemetrySimulatorService(repo, { clock: () => FIXED_MS, random });
  return { repo, sim };
}

describe('TelemetrySimulatorService', () => {
  describe('lifecycle', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('starts exactly one interval and is idempotent', () => {
      jest.useFakeTimers();
      const setSpy = jest.spyOn(global, 'setInterval');
      const { sim } = repoWith(createSeedLinks(), constRandom(0.5));

      expect(sim.running).toBe(false);
      sim.start();
      expect(sim.running).toBe(true);
      sim.start(); // duplicate init guarded
      sim.start();
      expect(setSpy).toHaveBeenCalledTimes(1);

      sim.stop();
      setSpy.mockRestore();
    });

    it('clears its interval on stop / shutdown hook', () => {
      jest.useFakeTimers();
      const clearSpy = jest.spyOn(global, 'clearInterval');
      const { sim } = repoWith(createSeedLinks(), constRandom(0.5));

      sim.onModuleInit();
      expect(sim.running).toBe(true);
      sim.onApplicationShutdown();
      expect(sim.running).toBe(false);
      expect(clearSpy).toHaveBeenCalledTimes(1);

      clearSpy.mockRestore();
    });
  });

  describe('tick', () => {
    it('produces exactly one sample per link', async () => {
      const links = createSeedLinks(); // 10 links
      const { repo, sim } = repoWith(links, constRandom(0.5));

      await sim.tick();

      for (const link of links) {
        const latest = repo.latestSample(link.id);
        expect(latest).toBeDefined();
        expect(latest?.linkId).toBe(link.id);
        expect(repo.getSamples(link.id, Number.MAX_SAFE_INTEGER)).toHaveLength(1);
      }
      // one sample per link, no extras
      const totalLatest = links.filter((l) => repo.latestSample(l.id)).length;
      expect(totalLatest).toBe(links.length);
    });

    it('emits samples that satisfy the telemetry contract and bounds', async () => {
      const links = createSeedLinks();
      const { repo, sim } = repoWith(links, cyclingRandom([0.3, 0.7, 0.5, 0.9]));

      await sim.tick();

      for (const link of links) {
        const s = repo.latestSample(link.id);
        expect(s).toBeDefined();
        if (!s) continue;
        expect(s.linkId).toBe(link.id);
        // valid ISO-8601 round-trip
        expect(Number.isNaN(Date.parse(s.ts))).toBe(false);
        expect(new Date(s.ts).toISOString()).toBe(s.ts);
        // throughput within [0, capacity]
        expect(s.throughputMbps).toBeGreaterThanOrEqual(0);
        expect(s.throughputMbps).toBeLessThanOrEqual(link.capacityMbps);
        // rssi / snr within configured bounds
        expect(s.rssiDbm).toBeGreaterThanOrEqual(SIMULATOR_DEFAULTS.bounds.rssiDbm.min);
        expect(s.rssiDbm).toBeLessThanOrEqual(SIMULATOR_DEFAULTS.bounds.rssiDbm.max);
        expect(s.snrDb).toBeGreaterThanOrEqual(SIMULATOR_DEFAULTS.bounds.snrDb.min);
        expect(s.snrDb).toBeLessThanOrEqual(SIMULATOR_DEFAULTS.bounds.snrDb.max);
      }
    });

    it('all samples in a tick share the same timestamp', async () => {
      const links = createSeedLinks();
      const { repo, sim } = repoWith(links, constRandom(0.5));
      await sim.tick();
      const stamps = new Set(links.map((l) => repo.latestSample(l.id)?.ts));
      expect(stamps.size).toBe(1);
    });
  });

  describe('drift', () => {
    it('changes telemetry across ticks rather than staying static', async () => {
      const [seed] = createSeedLinks();
      const { repo, sim } = repoWith([seed], cyclingRandom([0.2, 0.8, 0.4, 0.9, 0.6]));

      await sim.tick();
      const first = repo.latestSample(seed.id);
      await sim.tick();
      const second = repo.latestSample(seed.id);

      expect(first).toBeDefined();
      expect(second).toBeDefined();
      const changed =
        first?.snrDb !== second?.snrDb ||
        first?.rssiDbm !== second?.rssiDbm ||
        first?.throughputMbps !== second?.throughputMbps;
      expect(changed).toBe(true);
    });
  });

  describe('degradation and recovery (deterministic)', () => {
    it('drives telemetry into the degraded band via deriveLinkStatus', async () => {
      // constRandom(0) forces a degradation episode on the first eligible tick.
      const [seed] = createSeedLinks();
      const { repo, sim } = repoWith([seed], constRandom(0));

      for (let i = 0; i < SIMULATOR_DEFAULTS.degradation.minTicks; i++) {
        await sim.tick();
      }

      const link = await repo.getById(seed.id);
      const latest = repo.latestSample(seed.id);
      expect(link).toBeDefined();
      expect(latest).toBeDefined();
      if (!link) return;
      expect(deriveLinkStatus(link, latest, NOW)).toBe('degraded');
    });

    it('recovers to up after the episode ends (cooldown prevents re-degrade)', async () => {
      const [seed] = createSeedLinks();
      const { repo, sim } = repoWith([seed], constRandom(0));

      // single episode (6 ticks) then long recovery under cooldown
      for (let i = 0; i < 24; i++) {
        await sim.tick();
      }

      const link = await repo.getById(seed.id);
      const latest = repo.latestSample(seed.id);
      if (!link) return;
      expect(deriveLinkStatus(link, latest, NOW)).toBe('up');
    });

    it('does not degrade every link at once', async () => {
      // never trigger => all links stay healthy/up
      const links = createSeedLinks();
      const { repo, sim } = repoWith(links, constRandom(0.99));
      await sim.tick();
      const statuses: LinkStatus[] = [];
      for (const l of links) {
        const link = await repo.getById(l.id);
        if (!link) continue;
        statuses.push(deriveLinkStatus(link, repo.latestSample(l.id), NOW));
      }
      expect(statuses).toHaveLength(links.length);
      expect(statuses.every((s) => s === 'up')).toBe(true);
    });
  });

  describe('memory safety', () => {
    it('keeps each ring buffer bounded to 300 after many ticks', async () => {
      const [seed] = createSeedLinks();
      const { repo, sim } = repoWith([seed], constRandom(0.5));

      for (let i = 0; i < 400; i++) {
        await sim.tick();
      }

      expect(repo.getSamples(seed.id, Number.MAX_SAFE_INTEGER)).toHaveLength(300);
      expect(sim.trackedLinks).toBe(1);
    });
  });

  describe('fleet membership changes', () => {
    it('stops simulating a deleted link and prunes its state', async () => {
      const links = createSeedLinks();
      const target = links[0].id;
      const { repo, sim } = repoWith(links, constRandom(0.5));

      await sim.tick();
      expect(repo.latestSample(target)).toBeDefined();
      expect(sim.trackedLinks).toBe(links.length);

      await repo.delete(target);
      await expect(sim.tick()).resolves.toBeUndefined(); // no crash
      expect(repo.latestSample(target)).toBeUndefined();
      expect(sim.trackedLinks).toBe(links.length - 1);
    });

    it('begins simulating a newly created link on the next tick', async () => {
      const { repo, sim } = repoWith(createSeedLinks(), constRandom(0.5));
      const input: CreateLinkInput = {
        name: 'Late Joiner',
        siteA: 'A',
        siteB: 'B',
        band: '5GHz',
        mode: 'PtP',
        channelWidthMhz: 40,
        capacityMbps: 200,
        txPowerDbm: 20,
      };
      const created = await repo.create(input);
      expect(repo.latestSample(created.id)).toBeUndefined();

      await sim.tick();
      expect(repo.latestSample(created.id)).toBeDefined();
      expect(repo.latestSample(created.id)?.linkId).toBe(created.id);
    });
  });

  describe('scheduled tick hardening (M3)', () => {
    it('does not overlap: a second runTick while one is in flight is skipped', async () => {
      const [seed] = createSeedLinks();
      const { repo, sim } = repoWith([seed], constRandom(0.5));

      // runTick() runs synchronously up to the first await (repository.list),
      // setting inFlight before returning its promise. The second call therefore
      // sees inFlight === true and is skipped — only one pass runs.
      const p1 = sim.runTick();
      expect(sim.busy).toBe(true);
      const p2 = sim.runTick();
      await Promise.all([p1, p2]);

      expect(repo.getSamples(seed.id, Number.MAX_SAFE_INTEGER)).toHaveLength(1);
      expect(sim.busy).toBe(false);
    });

    it('contains a tick failure and lets later ticks succeed', async () => {
      const [seed] = createSeedLinks();
      const inner = new InMemoryLinkRepository({ seed: [seed], clock: () => FIXED_MS });
      let failNext = true;
      // Delegating repository whose first list() rejects, then behaves normally.
      const flaky: LinkRepository = {
        list: async (q) => {
          if (failNext) {
            failNext = false;
            throw new Error('boom');
          }
          return inner.list(q);
        },
        getById: (id) => inner.getById(id),
        create: (i) => inner.create(i),
        update: (id, p, v) => inner.update(id, p, v),
        delete: (id) => inner.delete(id),
        appendSample: (s) => inner.appendSample(s),
        getSamples: (id, w) => inner.getSamples(id, w),
        latestSample: (id) => inner.latestSample(id),
      };

      const errors: unknown[] = [];
      const sim = new TelemetrySimulatorService(flaky, {
        clock: () => FIXED_MS,
        random: constRandom(0.5),
        onError: (e) => errors.push(e),
      });

      // 1) failing tick — contained, no throw, no sample, flag reset
      await expect(sim.runTick()).resolves.toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(inner.latestSample(seed.id)).toBeUndefined();
      expect(sim.busy).toBe(false);

      // 2) subsequent tick recovers and produces a sample; no new error
      await sim.runTick();
      expect(inner.latestSample(seed.id)).toBeDefined();
      expect(errors).toHaveLength(1);
    });
  });
});
