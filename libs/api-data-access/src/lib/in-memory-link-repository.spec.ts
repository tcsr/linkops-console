import {
  DuplicateLinkNameError,
  InvalidLinkNameError,
  LinkNotFoundError,
  VersionConflictError,
  linkId,
  type CreateLinkInput,
  type TelemetrySample,
} from '@linkops/domain';
import { InMemoryLinkRepository } from './in-memory-link-repository.js';
import { createSeedLinks } from './seed-links.js';

const FIXED_MS = Date.parse('2025-06-01T00:00:00.000Z');

const newLinkInput: CreateLinkInput = {
  name: 'New Link',
  siteA: 'A',
  siteB: 'B',
  band: '6GHz',
  mode: 'PtP',
  channelWidthMhz: 80,
  capacityMbps: 500,
  txPowerDbm: 21,
};

function makeRepo(): InMemoryLinkRepository {
  let tick = 0;
  return new InMemoryLinkRepository({
    seed: createSeedLinks(),
    // advance the clock by 1s per call so create/update timestamps differ
    clock: () => FIXED_MS + tick++ * 1000,
  });
}

describe('InMemoryLinkRepository', () => {
  describe('create', () => {
    it('assigns an id, version 1, and equal created/updated timestamps', async () => {
      const repo = makeRepo();
      const created = await repo.create(newLinkInput);
      expect(created.id).toBe('link-0011'); // after 10 seed links
      expect(created.version).toBe(1);
      expect(created.createdAt).toBe(created.updatedAt);
      expect(created.name).toBe('New Link');
      expect(created.txPowerDbm).toBe(21);
    });

    it('rejects a name shorter than 3 characters', async () => {
      const repo = makeRepo();
      await expect(
        repo.create({ ...newLinkInput, name: 'ab' }),
      ).rejects.toBeInstanceOf(InvalidLinkNameError);
    });

    it('rejects a name longer than 40 characters', async () => {
      const repo = makeRepo();
      await expect(
        repo.create({ ...newLinkInput, name: 'x'.repeat(41) }),
      ).rejects.toBeInstanceOf(InvalidLinkNameError);
    });

    it('rejects a duplicate name', async () => {
      const repo = makeRepo();
      await expect(
        repo.create({ ...newLinkInput, name: 'Stadium Backhaul' }),
      ).rejects.toBeInstanceOf(DuplicateLinkNameError);
    });
  });

  describe('getById', () => {
    it('returns a seeded link', async () => {
      const repo = makeRepo();
      const link = await repo.getById(linkId('link-0001'));
      expect(link?.name).toBe('HQ ↔ North Tower');
    });

    it('returns undefined for an unknown id', async () => {
      const repo = makeRepo();
      expect(await repo.getById(linkId('nope'))).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all seeded links by default', async () => {
      const repo = makeRepo();
      expect(await repo.list({})).toHaveLength(10);
    });

    it('filters by band', async () => {
      const repo = makeRepo();
      const results = await repo.list({ band: '5GHz' });
      expect(results.map((l) => l.id)).toEqual(['link-0001', 'link-0005', 'link-0008']);
    });

    it('filters by mode', async () => {
      const repo = makeRepo();
      const results = await repo.list({ mode: 'PtMP' });
      expect(results.map((l) => l.id)).toEqual(['link-0003', 'link-0005', 'link-0009']);
    });

    it('filters by case-insensitive search across name and sites', async () => {
      const repo = makeRepo();
      const results = await repo.list({ search: 'stadium' });
      expect(results.map((l) => l.id)).toEqual(['link-0004']);
    });
  });

  describe('update', () => {
    it('increments version and refreshes updatedAt while keeping createdAt', async () => {
      const repo = makeRepo();
      const before = await repo.getById(linkId('link-0001'));
      const updated = await repo.update(
        linkId('link-0001'),
        { capacityMbps: 999 },
        1,
      );
      expect(updated.version).toBe(2);
      expect(updated.capacityMbps).toBe(999);
      expect(updated.createdAt).toBe(before?.createdAt);
      expect(updated.updatedAt).not.toBe(before?.updatedAt);
    });

    it('throws VersionConflictError on a stale expectedVersion', async () => {
      const repo = makeRepo();
      await expect(
        repo.update(linkId('link-0001'), { capacityMbps: 1 }, 99),
      ).rejects.toBeInstanceOf(VersionConflictError);
    });

    it('does not mutate the stored link on a version conflict', async () => {
      const repo = makeRepo();
      await repo
        .update(linkId('link-0001'), { capacityMbps: 1 }, 99)
        .catch(() => undefined);
      const link = await repo.getById(linkId('link-0001'));
      expect(link?.version).toBe(1);
      expect(link?.capacityMbps).toBe(250);
    });

    it('throws LinkNotFoundError for an unknown id', async () => {
      const repo = makeRepo();
      await expect(
        repo.update(linkId('nope'), { capacityMbps: 1 }, 1),
      ).rejects.toBeInstanceOf(LinkNotFoundError);
    });

    it('rejects renaming to a name already used by another link', async () => {
      const repo = makeRepo();
      await expect(
        repo.update(linkId('link-0001'), { name: 'Stadium Backhaul' }, 1),
      ).rejects.toBeInstanceOf(DuplicateLinkNameError);
    });

    it('allows an idempotent update that keeps the same name', async () => {
      const repo = makeRepo();
      const updated = await repo.update(
        linkId('link-0001'),
        { name: 'HQ ↔ North Tower', capacityMbps: 260 },
        1,
      );
      expect(updated.version).toBe(2);
      expect(updated.capacityMbps).toBe(260);
    });

    it('cannot overwrite repository-managed fields via the patch', async () => {
      const repo = makeRepo();
      const updated = await repo.update(
        linkId('link-0001'),
        // deliberately smuggle managed fields through an untyped patch
        { version: 100, id: 'hacked' } as never,
        1,
      );
      expect(updated.id).toBe('link-0001');
      expect(updated.version).toBe(2);
    });
  });

  describe('delete', () => {
    it('removes the link', async () => {
      const repo = makeRepo();
      await repo.delete(linkId('link-0001'));
      expect(await repo.getById(linkId('link-0001'))).toBeUndefined();
      expect(await repo.list({})).toHaveLength(9);
    });

    it('throws LinkNotFoundError for an unknown id', async () => {
      const repo = makeRepo();
      await expect(repo.delete(linkId('nope'))).rejects.toBeInstanceOf(
        LinkNotFoundError,
      );
    });
  });

  describe('telemetry', () => {
    const id = linkId('link-0001');
    function sampleAt(ms: number, over: Partial<TelemetrySample> = {}): TelemetrySample {
      return {
        linkId: id,
        ts: new Date(ms).toISOString(),
        rssiDbm: -55,
        snrDb: 20,
        throughputMbps: 100,
        ...over,
      };
    }

    it('returns undefined latest sample when none stored', () => {
      const repo = makeRepo();
      expect(repo.latestSample(id)).toBeUndefined();
      expect(repo.getSamples(id, 60_000)).toEqual([]);
    });

    it('tracks the latest sample', () => {
      const repo = makeRepo();
      repo.appendSample(sampleAt(1000));
      repo.appendSample(sampleAt(2000, { snrDb: 25 }));
      expect(repo.latestSample(id)?.ts).toBe(new Date(2000).toISOString());
      expect(repo.latestSample(id)?.snrDb).toBe(25);
    });

    it('returns only samples within the window relative to the newest', () => {
      const repo = makeRepo();
      repo.appendSample(sampleAt(1000));
      repo.appendSample(sampleAt(2000));
      repo.appendSample(sampleAt(3000));
      // window 1500ms from newest (3000) => threshold 1500 => keep 2000,3000
      const windowed = repo.getSamples(id, 1500);
      expect(windowed.map((s) => s.ts)).toEqual([
        new Date(2000).toISOString(),
        new Date(3000).toISOString(),
      ]);
    });

    it('bounds stored telemetry to the configured capacity', () => {
      const repo = new InMemoryLinkRepository({
        seed: createSeedLinks(),
        telemetryCapacity: 300,
      });
      for (let i = 0; i < 400; i++) {
        repo.appendSample(sampleAt(i * 1000));
      }
      // huge window => would return everything if unbounded; capped at 300
      expect(repo.getSamples(id, Number.MAX_SAFE_INTEGER)).toHaveLength(300);
      expect(repo.latestSample(id)?.ts).toBe(new Date(399 * 1000).toISOString());
    });

    it('discards telemetry when the link is deleted', async () => {
      const repo = makeRepo();
      repo.appendSample(sampleAt(1000));
      await repo.delete(id);
      expect(repo.latestSample(id)).toBeUndefined();
    });
  });
});
