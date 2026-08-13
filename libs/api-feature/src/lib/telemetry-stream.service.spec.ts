import {
  linkId,
  type Link,
  type LinkId,
  type TelemetrySample,
} from '@linkops/domain';
import { InMemoryLinkRepository } from '@linkops/api-data-access';
import { FleetEventBus } from './fleet-event-bus.js';
import type { FleetEvent } from './fleet-event.js';
import { FleetService } from './fleet.service.js';
import { TelemetryStreamService } from './telemetry-stream.service.js';

const TS = '2025-06-01T00:00:00.000Z';
const FIXED_MS = Date.parse(TS);
const CAPACITY = 100;

/** Build a deterministic link with a known capacity (100 → simple thresholds). */
function makeLink(id: string, name: string): Link {
  return {
    id: linkId(id),
    name,
    siteA: 'Alpha',
    siteB: 'Beta',
    band: '5GHz',
    mode: 'PtP',
    channelWidthMhz: 40,
    capacityMbps: CAPACITY,
    txPowerDbm: 20,
    version: 1,
    createdAt: TS,
    updatedAt: TS,
  };
}

/** Sample using the tick timestamp, so status derivation is never stale. */
function sample(id: LinkId, snrDb: number, throughputMbps: number): TelemetrySample {
  return { linkId: id, ts: TS, rssiDbm: -55, snrDb, throughputMbps };
}

// For capacity 100: up => snr>=18 & tput>=60; degraded => snr>=10 & tput>=20.
const up = (id: LinkId): TelemetrySample => sample(id, 25, 90);
const degraded = (id: LinkId): TelemetrySample => sample(id, 12, 35);

interface Harness {
  repo: InMemoryLinkRepository;
  bus: FleetEventBus;
  service: TelemetryStreamService;
  events: FleetEvent[];
}

function harnessWith(links: Link[]): Harness {
  const repo = new InMemoryLinkRepository({ seed: links, clock: () => FIXED_MS });
  const bus = new FleetEventBus();
  const fleet = new FleetService(repo);
  const service = new TelemetryStreamService(repo, bus, fleet);
  const events: FleetEvent[] = [];
  bus.events$().subscribe((e) => events.push(e));
  return { repo, bus, service, events };
}

const only = (events: FleetEvent[], type: FleetEvent['type']): FleetEvent[] =>
  events.filter((e) => e.type === type);

describe('TelemetryStreamService', () => {
  it('emits one link.telemetry per sample in the tick', async () => {
    const links = [makeLink('link-1', 'One'), makeLink('link-2', 'Two'), makeLink('link-3', 'Three')];
    const { service, events } = harnessWith(links);

    await service.handleTick(links.map((l) => up(l.id)));

    const telemetry = only(events, 'link.telemetry');
    expect(telemetry).toHaveLength(3);
    expect(telemetry.map((e) => (e.type === 'link.telemetry' ? e.data.linkId : null))).toEqual([
      linkId('link-1'),
      linkId('link-2'),
      linkId('link-3'),
    ]);
  });

  it('emits link.status with previous=null on first observation', async () => {
    const link = makeLink('link-1', 'One');
    const { service, events } = harnessWith([link]);

    await service.handleTick([up(link.id)]);

    const status = only(events, 'link.status');
    expect(status).toHaveLength(1);
    expect(status[0]).toEqual({
      type: 'link.status',
      data: { linkId: linkId('link-1'), status: 'up', previous: null },
    });
  });

  it('does not re-emit link.status when status is unchanged', async () => {
    const link = makeLink('link-1', 'One');
    const { service, events } = harnessWith([link]);

    await service.handleTick([up(link.id)]);
    await service.handleTick([up(link.id)]);

    expect(only(events, 'link.status')).toHaveLength(1); // only the first tick
  });

  it('emits exactly one transition event on up -> degraded', async () => {
    const link = makeLink('link-1', 'One');
    const { service, events } = harnessWith([link]);

    await service.handleTick([up(link.id)]); // up (previous=null)
    events.length = 0; // focus on the transition tick
    await service.handleTick([degraded(link.id)]);

    const status = only(events, 'link.status');
    expect(status).toEqual([
      {
        type: 'link.status',
        data: { linkId: linkId('link-1'), status: 'degraded', previous: 'up' },
      },
    ]);
  });

  it('emits the recovery transition on degraded -> up', async () => {
    const link = makeLink('link-1', 'One');
    const { service, events } = harnessWith([link]);

    await service.handleTick([up(link.id)]);
    await service.handleTick([degraded(link.id)]);
    events.length = 0;
    await service.handleTick([up(link.id)]);

    expect(only(events, 'link.status')).toEqual([
      {
        type: 'link.status',
        data: { linkId: linkId('link-1'), status: 'up', previous: 'degraded' },
      },
    ]);
  });

  it('emits exactly one fleet.summary per tick', async () => {
    const links = [makeLink('link-1', 'One'), makeLink('link-2', 'Two')];
    const { service, events } = harnessWith(links);

    await service.handleTick(links.map((l) => up(l.id)));

    expect(only(events, 'fleet.summary')).toHaveLength(1);
  });

  it('produces a deterministic event sequence: telemetry, then status, then summary', async () => {
    const links = [makeLink('link-1', 'One'), makeLink('link-2', 'Two')];
    const { service, events } = harnessWith(links);

    await service.handleTick(links.map((l) => up(l.id)));

    // 2 telemetry, 2 first-observation status, 1 summary — in that order.
    expect(events.map((e) => e.type)).toEqual([
      'link.telemetry',
      'link.telemetry',
      'link.status',
      'link.status',
      'fleet.summary',
    ]);
  });

  it('emits one fleet.summary per tick across multiple ticks', async () => {
    const link = makeLink('link-1', 'One');
    const { service, events } = harnessWith([link]);

    await service.handleTick([up(link.id)]);
    await service.handleTick([up(link.id)]);
    await service.handleTick([degraded(link.id)]);

    expect(only(events, 'fleet.summary')).toHaveLength(3);
    // status: first (up), no re-emit, transition (degraded) => 2 total.
    expect(only(events, 'link.status')).toHaveLength(2);
  });

  it('stops emitting for a deleted link, prunes its status, and keeps others', async () => {
    const a = makeLink('link-1', 'One');
    const b = makeLink('link-2', 'Two');
    const { repo, service, events } = harnessWith([a, b]);

    await service.handleTick([up(a.id), up(b.id)]);
    await repo.delete(a.id);
    events.length = 0;

    // Next tick's batch only contains the surviving link (simulator prunes),
    // and even if a stale sample for the deleted link arrived it is skipped.
    await service.handleTick([up(b.id), up(a.id)]);

    const telemetry = only(events, 'link.telemetry');
    expect(telemetry).toHaveLength(1); // only link-2
    expect(telemetry[0].type === 'link.telemetry' && telemetry[0].data.linkId).toBe(
      linkId('link-2'),
    );
    // no status/telemetry for the deleted link
    const statusIds = only(events, 'link.status').map((e) =>
      e.type === 'link.status' ? e.data.linkId : null,
    );
    expect(statusIds).not.toContain(linkId('link-1'));
    // summary still emitted, reflecting the reduced fleet
    const summaries = only(events, 'fleet.summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].type === 'fleet.summary' && summaries[0].data.total).toBe(1);
  });

  it('never throws and does not require the caller to await when used as a sink', async () => {
    const link = makeLink('link-1', 'One');
    const { service } = harnessWith([link]);
    // emit() is the fire-and-forget TelemetrySink adapter.
    expect(() => service.emit([up(link.id)])).not.toThrow();
  });

  it('isolates event-processing failure from the caller', async () => {
    const link = makeLink('link-1', 'One');
    const repo = new InMemoryLinkRepository({ seed: [link], clock: () => FIXED_MS });
    const bus = new FleetEventBus();
    const fleet = new FleetService(repo);
    const service = new TelemetryStreamService(repo, bus, fleet);
    // Force the async core to reject; emit must swallow it (no unhandled rejection).
    jest.spyOn(bus, 'publish').mockImplementation(() => {
      throw new Error('bus boom');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => service.emit([up(link.id)])).not.toThrow();
    await service.whenIdle();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  describe('serialized batch processing (concurrency correction)', () => {
    /** A repository whose `list()` blocks on an external gate for the first call. */
    function gatedHarness(link: Link): {
      harness: Harness;
      gateFirstList: () => () => void;
      listCalls: () => number;
    } {
      const repo = new InMemoryLinkRepository({
        seed: [link],
        clock: () => FIXED_MS,
      });
      const bus = new FleetEventBus();
      const fleet = new FleetService(repo);
      const service = new TelemetryStreamService(repo, bus, fleet);
      const events: FleetEvent[] = [];
      bus.events$().subscribe((e) => events.push(e));

      let calls = 0;
      const realList = repo.list.bind(repo);
      let gate: Promise<void> | undefined;
      const spy = jest.spyOn(repo, 'list').mockImplementation(async (q) => {
        calls++;
        if (gate !== undefined) {
          const g = gate;
          gate = undefined; // gate only the first gated call
          await g;
        }
        return realList(q);
      });
      void spy;

      return {
        harness: { repo, bus, service, events },
        listCalls: () => calls,
        gateFirstList: () => {
          let release!: () => void;
          gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          return release;
        },
      };
    }

    it('does not start batch #2 until batch #1 has completed', async () => {
      const link = makeLink('link-1', 'One');
      const { harness, gateFirstList, listCalls } = gatedHarness(link);
      const { service, events } = harness;

      const release = gateFirstList(); // batch #1 will block inside handleTick
      service.emit([up(link.id)]); // batch #1
      service.emit([degraded(link.id)]); // batch #2 (queued)

      // Let microtasks run: batch #1 is blocked before any publish. batch #2
      // has not started — its handleTick would call list() (making calls > 1)
      // and publish events; both counters prove it is still queued.
      await Promise.resolve();
      await Promise.resolve();
      expect(listCalls()).toBe(1);
      expect(events).toHaveLength(0);

      release(); // let batch #1 finish; batch #2 then runs
      await service.whenIdle();

      const statuses = only(events, 'link.status').map((e) =>
        e.type === 'link.status' ? e.data.status : null,
      );
      expect(statuses).toEqual(['up', 'degraded']); // batch #1 then batch #2
    });

    it('emits all of batch #1 events before any batch #2 events', async () => {
      const link = makeLink('link-1', 'One');
      const { harness, gateFirstList } = gatedHarness(link);
      const { service, events } = harness;

      const release = gateFirstList();
      service.emit([up(link.id)]);
      service.emit([degraded(link.id)]);
      release();
      await service.whenIdle();

      // batch #1: telemetry, status(up), summary ; then batch #2 in full.
      expect(events.map((e) => e.type)).toEqual([
        'link.telemetry',
        'link.status',
        'fleet.summary',
        'link.telemetry',
        'link.status',
        'fleet.summary',
      ]);
    });

    it('processes batch #2 even if batch #1 fails', async () => {
      const link = makeLink('link-1', 'One');
      const repo = new InMemoryLinkRepository({ seed: [link], clock: () => FIXED_MS });
      const bus = new FleetEventBus();
      const fleet = new FleetService(repo);
      const service = new TelemetryStreamService(repo, bus, fleet);
      const events: FleetEvent[] = [];
      bus.events$().subscribe((e) => events.push(e));

      let calls = 0;
      const realList = repo.list.bind(repo);
      jest.spyOn(repo, 'list').mockImplementation(async (q) => {
        calls++;
        if (calls === 1) {
          throw new Error('batch #1 boom');
        }
        return realList(q);
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      service.emit([up(link.id)]); // batch #1 → fails
      service.emit([up(link.id)]); // batch #2 → must still run
      await service.whenIdle();

      expect(errorSpy).toHaveBeenCalled();
      expect(only(events, 'fleet.summary')).toHaveLength(1); // only batch #2
      expect(only(events, 'link.telemetry')).toHaveLength(1);

      errorSpy.mockRestore();
    });
  });
});
