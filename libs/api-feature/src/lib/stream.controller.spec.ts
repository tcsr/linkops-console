import 'reflect-metadata';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication, MessageEvent } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TelemetrySimulatorService,
  type InMemoryLinkRepository,
} from '@linkops/api-data-access';
import { linkId, type FleetSummary, type TelemetrySample } from '@linkops/domain';
import { ApiModule } from './api.module.js';
import { LINK_REPOSITORY } from './tokens.js';
import { FleetEventBus } from './fleet-event-bus.js';
import type { FleetEvent } from './fleet-event.js';
import { StreamController } from './stream.controller.js';

const TS = '2026-08-05T09:00:01.000Z';

function telemetryEvent(id: string): FleetEvent {
  const data: TelemetrySample = {
    linkId: linkId(id),
    ts: TS,
    rssiDbm: -62,
    snrDb: 21,
    throughputMbps: 184,
  };
  return { type: 'link.telemetry', data };
}

function statusEvent(id: string): FleetEvent {
  return {
    type: 'link.status',
    data: { linkId: linkId(id), status: 'degraded', previous: 'up' },
  };
}

function summaryEvent(): FleetEvent {
  const data: FleetSummary = {
    total: 10,
    up: 8,
    degraded: 2,
    down: 0,
    avgThroughputMbps: 180,
    worstLinkId: linkId('link-0002'),
  };
  return { type: 'fleet.summary', data };
}

describe('StreamController (unit)', () => {
  function setup(): { bus: FleetEventBus; controller: StreamController } {
    const bus = new FleetEventBus();
    return { bus, controller: new StreamController(bus) };
  }

  it('maps link.telemetry to an SSE MessageEvent with an informational id', () => {
    const { bus, controller } = setup();
    const received: MessageEvent[] = [];
    const sub = controller.stream().subscribe((m) => received.push(m));

    const event = telemetryEvent('link-0001');
    bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('link.telemetry');
    expect(received[0].data).toBe(event.data); // no field transformation
    expect(received[0].id).toBe(String(Date.parse(TS)));
    sub.unsubscribe();
  });

  it('maps link.status to an SSE MessageEvent with {linkId,status,previous}', () => {
    const { bus, controller } = setup();
    const received: MessageEvent[] = [];
    const sub = controller.stream().subscribe((m) => received.push(m));

    bus.publish(statusEvent('link-0001'));

    expect(received[0].type).toBe('link.status');
    expect(received[0].data).toEqual({
      linkId: linkId('link-0001'),
      status: 'degraded',
      previous: 'up',
    });
    expect(received[0].id).toBeUndefined(); // id only on telemetry
    sub.unsubscribe();
  });

  it('maps fleet.summary to an SSE MessageEvent with the FleetSummary payload', () => {
    const { bus, controller } = setup();
    const received: MessageEvent[] = [];
    const sub = controller.stream().subscribe((m) => received.push(m));

    const event = summaryEvent();
    bus.publish(event);

    expect(received[0].type).toBe('fleet.summary');
    expect(received[0].data).toBe(event.data);
    sub.unsubscribe();
  });

  it('delivers the same event to multiple independent subscribers', () => {
    const { bus, controller } = setup();
    const a: MessageEvent[] = [];
    const b: MessageEvent[] = [];
    const subA = controller.stream().subscribe((m) => a.push(m));
    const subB = controller.stream().subscribe((m) => b.push(m));

    bus.publish(statusEvent('link-0001'));

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    subA.unsubscribe();
    subB.unsubscribe();
  });

  it('isolates subscribers: unsubscribing A does not affect B', () => {
    const { bus, controller } = setup();
    const a: MessageEvent[] = [];
    const b: MessageEvent[] = [];
    const subA = controller.stream().subscribe((m) => a.push(m));
    const subB = controller.stream().subscribe((m) => b.push(m));

    bus.publish(statusEvent('link-1'));
    subA.unsubscribe();
    bus.publish(statusEvent('link-2'));

    expect(a).toHaveLength(1); // stopped after unsubscribe
    expect(b).toHaveLength(2); // keeps receiving
    subB.unsubscribe();
  });

  it('does not replay history to a late subscriber', () => {
    const { bus, controller } = setup();
    bus.publish(statusEvent('link-1')); // before any subscriber

    const late: MessageEvent[] = [];
    const sub = controller.stream().subscribe((m) => late.push(m));
    expect(late).toHaveLength(0);

    bus.publish(statusEvent('link-2'));
    expect(late).toHaveLength(1);
    sub.unsubscribe();
  });

  it('reconnect: a fresh subscription receives only new live events', () => {
    const { bus, controller } = setup();
    const first: MessageEvent[] = [];
    const sub1 = controller.stream().subscribe((m) => first.push(m));
    bus.publish(statusEvent('link-1'));
    sub1.unsubscribe(); // "disconnect"

    bus.publish(statusEvent('link-2')); // missed while disconnected

    const second: MessageEvent[] = [];
    const sub2 = controller.stream().subscribe((m) => second.push(m)); // "reconnect"
    bus.publish(statusEvent('link-3'));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1); // only link-3, no replay of link-2
    sub2.unsubscribe();
  });

  it('completes active stream subscriptions when the bus completes (shutdown)', () => {
    const { bus, controller } = setup();
    let completed = false;
    const sub = controller.stream().subscribe({
      complete: () => {
        completed = true;
      },
    });

    bus.onModuleDestroy();
    expect(completed).toBe(true);
    sub.unsubscribe();
  });
});

describe('StreamController (HTTP contract)', () => {
  const FIXED_MS = Date.parse('2025-06-01T00:00:00.000Z');
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
      .overrideProvider(TelemetrySimulatorService)
      .useFactory({
        factory: (repository: InMemoryLinkRepository) =>
          new TelemetrySimulatorService(repository, {
            intervalMs: 3_600_000, // no background tick during the test
            random: () => 0.5,
            clock: () => FIXED_MS,
          }),
        inject: [LINK_REPOSITORY],
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/stream returns 200 text/event-stream', async () => {
    // SSE never ends, so use a raw request against a listening server, read the
    // response headers, then destroy the socket.
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/stream' },
        (res) => {
          try {
            expect(res.statusCode).toBe(200);
            expect(String(res.headers['content-type'])).toContain('text/event-stream');
            resolve();
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            res.destroy();
            req.destroy();
          }
        },
      );
      req.on('error', () => undefined); // socket destroy surfaces here; ignore
    });
  });

  it('serves the M3 routes under the global /api prefix', async () => {
    await request(app.getHttpServer()).get('/api/links').expect(200);
    await request(app.getHttpServer()).get('/api/fleet/summary').expect(200);
    // The old un-prefixed roots are no longer served.
    await request(app.getHttpServer()).get('/links').expect(404);
  });
});
