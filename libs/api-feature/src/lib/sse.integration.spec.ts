import 'reflect-metadata';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TelemetrySimulatorService,
  type InMemoryLinkRepository,
} from '@linkops/api-data-access';
import { linkId, type LinkId, type TelemetrySample } from '@linkops/domain';
import { ApiModule } from './api.module.js';
import { LINK_REPOSITORY } from './tokens.js';
import { TelemetryStreamService } from './telemetry-stream.service.js';

/**
 * End-to-end M4 integration: real ApiModule wiring
 *   simulator -> TelemetrySink -> TelemetryStreamService -> FleetEventBus
 *   -> StreamController -> GET /api/stream -> real SSE socket client.
 *
 * The simulator provider is overridden ONLY to disable the 1 Hz background
 * timer (long interval) so ticks are driven explicitly; the real sink wiring
 * (the DI TelemetryStreamService) is preserved. Deterministic event *content*
 * is produced by invoking the real `stream.handleTick(samples)` with crafted
 * samples — that is the production method, so no derivation/summary logic is
 * duplicated in the test. Real simulator drift is exercised separately via
 * `sim.tick()`.
 */

const FIXED_MS = Date.parse('2025-06-01T00:00:00.000Z');
const TS = '2026-08-05T09:00:01.000Z';

// Seeded capacities: link-0001 = 250, link-0002 = 500.
const L1 = linkId('link-0001');
const L2 = linkId('link-0002');
const upSample = (id: LinkId, tput: number): TelemetrySample => ({
  linkId: id,
  ts: TS,
  rssiDbm: -55,
  snrDb: 30,
  throughputMbps: tput,
});
const degradedSample = (id: LinkId): TelemetrySample => ({
  linkId: id,
  ts: TS,
  rssiDbm: -75,
  snrDb: 12,
  throughputMbps: 80, // 250-cap link: >=50 (degraded) but <150 (not up)
});

interface SseFrame {
  type?: string;
  id?: string;
  data: string;
}

interface SseClient {
  readonly frames: SseFrame[];
  ended: boolean;
  waitFor(pred: () => boolean, label: string): Promise<void>;
  ofType(type: string): SseFrame[];
  close(): void;
}

/** Poll a predicate until true or a short cap elapses (real socket has no deterministic completion signal). */
function waitUntil(pred: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (pred()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`waitUntil timeout: ${label} (frames seen)`));
      }
    }, 5);
  });
}

/** Open a real SSE connection and parse `event:`/`id:`/`data:` frames. */
function connect(port: number): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const frames: SseFrame[] = [];
    let buffer = '';
    const req = http.get({ host: '127.0.0.1', port, path: '/api/stream' }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const frame: SseFrame = { data: '' };
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) frame.type = line.slice(6).trim();
            else if (line.startsWith('id:')) frame.id = line.slice(3).trim();
            else if (line.startsWith('data:')) frame.data = line.slice(5).trim();
          }
          if (frame.type !== undefined || frame.data.length > 0) frames.push(frame);
        }
      });
      const client: SseClient = {
        frames,
        ended: false,
        waitFor: (pred, label) => waitUntil(pred, label),
        ofType: (type) => frames.filter((f) => f.type === type),
        close: () => {
          res.destroy();
          req.destroy();
        },
      };
      res.on('end', () => {
        client.ended = true;
      });
      res.on('close', () => {
        client.ended = true;
      });
      resolve(client);
    });
    req.on('error', reject);
  });
}

describe('SSE stream (end-to-end integration)', () => {
  let app: INestApplication;
  let port: number;
  let sim: TelemetrySimulatorService;
  let stream: TelemetryStreamService;
  const clients: SseClient[] = [];

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(TelemetrySimulatorService)
      .useFactory({
        factory: (
          repository: InMemoryLinkRepository,
          sink: TelemetryStreamService,
        ) =>
          new TelemetrySimulatorService(repository, {
            intervalMs: 3_600_000, // no background tick; ticks are driven explicitly
            clock: () => FIXED_MS,
            random: () => 0.5, // healthy fleet, no random degradation
            sink,
          }),
        inject: [LINK_REPOSITORY, TelemetryStreamService],
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    sim = app.get(TelemetrySimulatorService);
    stream = app.get(TelemetryStreamService);
  });

  let closed = false;
  afterEach(async () => {
    for (const c of clients) c.close();
    clients.length = 0;
    if (!closed) {
      await app.close();
    }
    closed = false;
  });

  async function open(): Promise<SseClient> {
    const c = await connect(port);
    clients.push(c);
    return c;
  }

  it('serves GET /api/stream as text/event-stream and delivers real simulator telemetry', async () => {
    const client = await open();

    await sim.tick(); // real production flow: simulator -> sink -> service -> bus
    await stream.whenIdle();
    await client.waitFor(() => client.ofType('fleet.summary').length >= 1, 'one summary');

    // 10 seeded links -> 10 telemetry frames + exactly one fleet.summary.
    expect(client.ofType('link.telemetry').length).toBe(10);
    expect(client.ofType('fleet.summary').length).toBe(1);
    const first = client.ofType('link.telemetry')[0];
    const sample = JSON.parse(first.data) as TelemetrySample;
    expect(sample.linkId).toBe('link-0001');
    expect(typeof sample.throughputMbps).toBe('number');
    expect(first.id).toBe(String(Date.parse(sample.ts))); // informational id
  });

  it('emits link.status on transition and not when unchanged', async () => {
    const client = await open();

    await stream.handleTick([upSample(L1, 220)]); // first observation -> up
    await client.waitFor(() => client.ofType('link.status').length >= 1, 'first status');

    await stream.handleTick([upSample(L1, 220)]); // unchanged -> no new status
    await stream.handleTick([degradedSample(L1)]); // transition -> degraded
    await client.waitFor(() => client.ofType('link.status').length >= 2, 'transition status');

    const statuses = client.ofType('link.status').map((f) => JSON.parse(f.data));
    expect(statuses).toEqual([
      { linkId: 'link-0001', status: 'up', previous: null },
      { linkId: 'link-0001', status: 'degraded', previous: 'up' },
    ]);
  });

  it('emits exactly one fleet.summary per completed tick', async () => {
    const client = await open();

    await stream.handleTick([upSample(L1, 220), upSample(L2, 400)]);
    await client.waitFor(() => client.ofType('fleet.summary').length >= 1, 'summary');
    // allow any stray frames to arrive; still exactly one summary for one tick
    await stream.whenIdle();

    expect(client.ofType('fleet.summary')).toHaveLength(1);
    const summary = JSON.parse(client.ofType('fleet.summary')[0].data);
    expect(summary.total).toBe(10); // full seeded fleet
  });

  it('preserves per-tick ordering: telemetry -> status -> summary, no cross-tick interleave', async () => {
    const client = await open();

    await stream.handleTick([upSample(L1, 220), upSample(L2, 400)]); // tick 1
    await stream.handleTick([upSample(L1, 220), upSample(L2, 400)]); // tick 2 (no status: unchanged)
    await client.waitFor(() => client.ofType('fleet.summary').length >= 2, 'two summaries');

    const types = client.frames.map((f) => f.type);
    expect(types).toEqual([
      // tick 1: two telemetry, two first-observation status, one summary
      'link.telemetry',
      'link.telemetry',
      'link.status',
      'link.status',
      'fleet.summary',
      // tick 2: two telemetry, no status, one summary
      'link.telemetry',
      'link.telemetry',
      'fleet.summary',
    ]);
  });

  it('fans out to multiple clients and isolates a disconnect', async () => {
    const a = await open();
    const b = await open();

    await stream.handleTick([upSample(L1, 220)]);
    await a.waitFor(() => a.ofType('link.telemetry').length >= 1, 'A telemetry');
    await b.waitFor(() => b.ofType('link.telemetry').length >= 1, 'B telemetry');
    expect(a.ofType('link.telemetry')).toHaveLength(1);
    expect(b.ofType('link.telemetry')).toHaveLength(1);

    a.close(); // disconnect A
    await stream.handleTick([upSample(L1, 220)]);
    await b.waitFor(() => b.ofType('link.telemetry').length >= 2, 'B still streaming');

    expect(b.ofType('link.telemetry')).toHaveLength(2);
    expect(a.ofType('link.telemetry')).toHaveLength(1); // A received nothing further
  });

  it('reconnect is live-only: a fresh connection receives no missed events', async () => {
    const first = await open();
    await stream.handleTick([upSample(L1, 220)]);
    await first.waitFor(() => first.ofType('link.telemetry').length >= 1, 'first got event');
    first.close();

    await stream.handleTick([upSample(L1, 220)]); // occurs while disconnected (missed)
    await stream.whenIdle();

    const reconnected = await open();
    await stream.handleTick([upSample(L2, 400)]); // new live event after reconnect
    await reconnected.waitFor(
      () => reconnected.ofType('link.telemetry').length >= 1,
      'reconnect got new event',
    );

    const samples = reconnected.ofType('link.telemetry').map((f) => JSON.parse(f.data));
    expect(samples).toHaveLength(1);
    expect(samples[0].linkId).toBe('link-0002'); // only the post-reconnect event, no replay
  });

  it('delete-while-streaming: stops events for the deleted link, keeps the rest, summary shrinks', async () => {
    const client = await open();

    await stream.handleTick([upSample(L1, 220), upSample(L2, 400)]);
    await client.waitFor(() => client.ofType('link.telemetry').length >= 2, 'both links');

    await request(app.getHttpServer()).delete('/api/links/link-0001').expect(204);

    const before = client.ofType('link.telemetry').length;
    await stream.handleTick([upSample(L1, 220), upSample(L2, 400)]); // L1 now deleted
    await client.waitFor(
      () => client.ofType('link.telemetry').length > before,
      'post-delete telemetry',
    );
    await stream.whenIdle();

    const postDelete = client.ofType('link.telemetry').slice(before).map((f) => JSON.parse(f.data));
    expect(postDelete.every((s) => s.linkId !== 'link-0001')).toBe(true); // no deleted-link events
    expect(postDelete.some((s) => s.linkId === 'link-0002')).toBe(true); // others continue
    const lastSummary = client.ofType('fleet.summary').at(-1);
    expect(JSON.parse(lastSummary?.data ?? '{}').total).toBe(9); // reduced fleet
  });

  it('recovers after a failed batch: the SSE client keeps receiving subsequent events', async () => {
    const client = await open();
    const repo = app.get<InMemoryLinkRepository>(LINK_REPOSITORY);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // Force the next stream batch to reject once, at the repository boundary.
    const realList = repo.list.bind(repo);
    let failed = false;
    jest.spyOn(repo, 'list').mockImplementation(async (q) => {
      if (!failed) {
        failed = true;
        throw new Error('integration boom');
      }
      return realList(q);
    });

    stream.emit([upSample(L1, 220)]); // batch #1 -> fails (contained)
    stream.emit([upSample(L2, 400)]); // batch #2 -> must still stream
    await stream.whenIdle();
    await client.waitFor(() => client.ofType('link.telemetry').length >= 1, 'post-failure event');

    expect(errorSpy).toHaveBeenCalled();
    const samples = client.ofType('link.telemetry').map((f) => JSON.parse(f.data));
    expect(samples.some((s) => s.linkId === 'link-0002')).toBe(true);
    errorSpy.mockRestore();
  });

  it('completes active SSE streams on application shutdown', async () => {
    const client = await open();
    await stream.handleTick([upSample(L1, 220)]);
    await client.waitFor(() => client.frames.length >= 1, 'first event');

    // Nest lifecycle: bus completes -> SSE observables complete -> response ends.
    // Fire the close (it can only fully drain once the SSE socket ends), observe
    // the client end, then await the drained close. Avoids an await deadlock on
    // the still-open streaming connection.
    const closing = app.close();
    await waitUntil(() => client.ended, 'stream ended on shutdown', 8000);
    await closing;
    closed = true; // afterEach must not close again
    expect(client.ended).toBe(true);
  }, 15000);
});
