import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TelemetrySimulatorService,
  type InMemoryLinkRepository,
} from '@linkops/api-data-access';
import { ApiModule } from './api.module.js';
import { LINK_REPOSITORY } from './tokens.js';

const FIXED_MS = Date.parse('2025-06-01T00:00:00.000Z');

/**
 * Boot the real ApiModule as a NestJS application. The simulator provider is
 * overridden with a long-interval, deterministic instance so no background tick
 * fires during a test; telemetry is driven explicitly via `sim.tick()`.
 */
async function makeApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
    .overrideProvider(TelemetrySimulatorService)
    .useFactory({
      factory: (repository: InMemoryLinkRepository) =>
        new TelemetrySimulatorService(repository, {
          intervalMs: 3_600_000,
          random: () => 0.5,
          clock: () => FIXED_MS,
        }),
      inject: [LINK_REPOSITORY],
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

const validCreate = {
  name: 'Test Uplink',
  siteA: 'Alpha',
  siteB: 'Beta',
  band: '5.8GHz',
  mode: 'PtP',
  channelWidthMhz: 80,
  capacityMbps: 500,
  txPowerDbm: 21,
};

describe('REST API (NestJS integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  describe('GET /api/links', () => {
    it('lists the seeded fleet with derived status', async () => {
      const res = await http().get('/api/links').expect(200);
      expect(res.body).toHaveLength(10);
      const first = res.body[0];
      expect(first).toMatchObject({ id: expect.any(String), version: 1 });
      expect(['up', 'degraded', 'down']).toContain(first.status);
      expect(first).toHaveProperty('latestSample'); // null until telemetry exists
    });

    it('filters by band', async () => {
      const res = await http().get('/api/links?band=5GHz').expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((l: { band: string }) => l.band === '5GHz')).toBe(true);
    });

    it('filters by search across name/sites', async () => {
      const res = await http().get('/api/links?search=stadium').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Stadium Backhaul');
    });

    it('sorts by name descending', async () => {
      const res = await http().get('/api/links?sort=name&order=desc').expect(200);
      const names: string[] = res.body.map((l: { name: string }) => l.name);
      // non-increasing by the same comparator the service uses (localeCompare)
      for (let i = 0; i < names.length - 1; i++) {
        expect(names[i].localeCompare(names[i + 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('filters by derived status (no telemetry => all down)', async () => {
      const res = await http().get('/api/links?status=down').expect(200);
      expect(res.body).toHaveLength(10);
      expect(await http().get('/api/links?status=up').then((r) => r.body)).toHaveLength(0);
    });

    it('rejects an unknown query parameter with 400 VALIDATION_FAILED', async () => {
      const res = await http().get('/api/links?bogus=1').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/links/:id', () => {
    it('returns a single link', async () => {
      const res = await http().get('/api/links/link-0001').expect(200);
      expect(res.body.id).toBe('link-0001');
    });

    it('returns 404 with the error envelope for an unknown id', async () => {
      const res = await http().get('/api/links/does-not-exist').expect(404);
      expect(res.body.error).toMatchObject({
        code: 'LINK_NOT_FOUND',
        statusCode: 404,
        path: '/api/links/does-not-exist',
      });
      expect(typeof res.body.error.timestamp).toBe('string');
    });
  });

  describe('POST /api/links', () => {
    it('creates a link (201) with version 1', async () => {
      const res = await http().post('/api/links').send(validCreate).expect(201);
      expect(res.body).toMatchObject({ name: 'Test Uplink', version: 1 });
      expect(res.body.id).toMatch(/^link-\d+$/);
    });

    it('rejects a missing required field with 400', async () => {
      const { name, ...rest } = validCreate;
      void name;
      const res = await http().post('/api/links').send(rest).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    it('rejects an out-of-range txPowerDbm with 400', async () => {
      const res = await http()
        .post('/api/links')
        .send({ ...validCreate, txPowerDbm: 99 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an invalid enum with 400', async () => {
      const res = await http()
        .post('/api/links')
        .send({ ...validCreate, band: '7GHz' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a duplicate name with 409 DUPLICATE_LINK_NAME', async () => {
      const res = await http()
        .post('/api/links')
        .send({ ...validCreate, name: 'Stadium Backhaul' })
        .expect(409);
      expect(res.body.error.code).toBe('DUPLICATE_LINK_NAME');
    });

    // --- assignment domain-model constraints (band/mode/width/capacity) ---
    it('rejects capacityMbps below the assignment minimum (10)', async () => {
      await http().post('/api/links').send({ ...validCreate, capacityMbps: 5 }).expect(400);
    });

    it('rejects capacityMbps above the assignment maximum (1000)', async () => {
      await http().post('/api/links').send({ ...validCreate, capacityMbps: 2000 }).expect(400);
    });

    it('accepts mode S2S (assignment domain value)', async () => {
      const res = await http()
        .post('/api/links')
        .send({ ...validCreate, name: 'S2S Link', mode: 'S2S' })
        .expect(201);
      expect(res.body.mode).toBe('S2S');
    });

    it('rejects channelWidthMhz 160 (not an assignment value)', async () => {
      await http()
        .post('/api/links')
        .send({ ...validCreate, channelWidthMhz: 160 })
        .expect(400);
    });

    it('accepts assignment bands (5.8GHz, 11GHz)', async () => {
      await http()
        .post('/api/links')
        .send({ ...validCreate, name: 'Band A', band: '5.8GHz' })
        .expect(201);
      await http()
        .post('/api/links')
        .send({ ...validCreate, name: 'Band B', band: '11GHz' })
        .expect(201);
    });
  });

  describe('PATCH /api/links/:id', () => {
    it('updates with the correct expectedVersion (version increments)', async () => {
      const res = await http()
        .patch('/api/links/link-0001')
        .send({ expectedVersion: 1, capacityMbps: 999 })
        .expect(200);
      expect(res.body).toMatchObject({ version: 2, capacityMbps: 999 });
    });

    it('returns 409 VERSION_CONFLICT on a stale expectedVersion', async () => {
      const res = await http()
        .patch('/api/links/link-0001')
        .send({ expectedVersion: 99, capacityMbps: 500 })
        .expect(409);
      expect(res.body.error).toMatchObject({
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
      expect(res.body.error.details).toMatchObject({ expectedVersion: 99 });
    });

    it('returns 400 when expectedVersion is missing', async () => {
      const res = await http()
        .patch('/api/links/link-0001')
        .send({ capacityMbps: 500 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .patch('/api/links/nope')
        .send({ expectedVersion: 1 })
        .expect(404);
    });

    it('returns 409 when renaming to an existing name', async () => {
      const res = await http()
        .patch('/api/links/link-0001')
        .send({ expectedVersion: 1, name: 'Stadium Backhaul' })
        .expect(409);
      expect(res.body.error.code).toBe('DUPLICATE_LINK_NAME');
    });
  });

  describe('DELETE /api/links/:id', () => {
    it('deletes a link (204) and then 404 on fetch', async () => {
      await http().delete('/api/links/link-0002').expect(204);
      await http().get('/api/links/link-0002').expect(404);
      const res = await http().get('/api/links').expect(200);
      expect(res.body).toHaveLength(9);
    });

    it('returns 404 deleting an unknown id', async () => {
      await http().delete('/api/links/nope').expect(404);
    });
  });

  describe('GET /api/links/:id/telemetry', () => {
    it('returns samples after the simulator ticks', async () => {
      const sim = app.get(TelemetrySimulatorService);
      await sim.tick();
      await sim.tick();

      const res = await http().get('/api/links/link-0001/telemetry').expect(200);
      expect(res.body.linkId).toBe('link-0001');
      expect(res.body.count).toBe(2);
      expect(res.body.samples).toHaveLength(2);
      const s = res.body.samples[0];
      expect(s).toMatchObject({ linkId: 'link-0001' });
      expect(typeof s.rssiDbm).toBe('number');
      expect(typeof s.snrDb).toBe('number');
      expect(typeof s.throughputMbps).toBe('number');
    });

    it('returns 404 telemetry for an unknown link', async () => {
      await http().get('/api/links/nope/telemetry').expect(404);
    });
  });

  describe('GET /api/fleet/summary', () => {
    it('returns the domain FleetSummary shape', async () => {
      const res = await http().get('/api/fleet/summary').expect(200);
      expect(res.body).toMatchObject({
        total: 10,
        up: expect.any(Number),
        degraded: expect.any(Number),
        down: expect.any(Number),
        avgThroughputMbps: expect.any(Number),
      });
      expect(res.body.up + res.body.degraded + res.body.down).toBe(10);
      expect(res.body).toHaveProperty('worstLinkId');
    });
  });
});

describe('TelemetrySimulatorService NestJS lifecycle', () => {
  it('is started by Nest on init and stopped on shutdown', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(TelemetrySimulatorService)
      .useFactory({
        factory: (repository: InMemoryLinkRepository) =>
          new TelemetrySimulatorService(repository, { intervalMs: 3_600_000 }),
        inject: [LINK_REPOSITORY],
      })
      .compile();

    const app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    app.setGlobalPrefix('api');
    await app.init();

    const sim = app.get(TelemetrySimulatorService);
    expect(sim.running).toBe(true); // Nest called onModuleInit -> start()

    await app.close(); // Nest lifecycle -> onApplicationShutdown -> stop()
    expect(sim.running).toBe(false);
  });
});
