import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { linkId, type FleetSummary, type TelemetrySample } from '@linkops/domain';
import { LinkDetailStore } from './link-detail-store';
import { FleetStore } from './fleet-store';
import type { FleetLinkView } from './fleet-model';
import {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
  type FrameScheduler,
} from './stream-tokens';

/** Fake EventSource that lets the test drive events. */
class FakeEventSource {
  static last: FakeEventSource | undefined;
  readonly listeners = new Map<string, (ev: MessageEvent) => void>();
  onerror: ((ev: Event) => void) | null = null;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
    this.listeners.set(type, cb);
  }
  close(): void {
    /* noop */
  }
  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  open(): void {
    this.listeners.get('open')?.({} as MessageEvent);
  }
}

class ManualScheduler implements FrameScheduler {
  private pending: (() => void) | null = null;
  schedule(cb: () => void): number {
    this.pending = cb;
    return 1;
  }
  cancel(): void {
    this.pending = null;
  }
  flush(): void {
    const p = this.pending;
    this.pending = null;
    p?.();
  }
}

const summary: FleetSummary = {
  total: 1,
  up: 1,
  degraded: 0,
  down: 0,
  avgThroughputMbps: 100,
  worstLinkId: null,
};

function view(id: string): FleetLinkView {
  return {
    id: linkId(id),
    name: id,
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    mode: 'PtP',
    channelWidthMhz: 40,
    capacityMbps: 250,
    txPowerDbm: 20,
    version: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'up',
    latestSample: null,
  };
}

function sample(ts: string, throughput: number): TelemetrySample {
  return { linkId: 'link-1', ts, rssiDbm: -55, snrDb: 25, throughputMbps: throughput };
}

describe('LinkDetailStore', () => {
  let store: LinkDetailStore;
  let http: HttpTestingController;
  let scheduler: ManualScheduler;

  beforeEach(() => {
    FakeEventSource.last = undefined;
    scheduler = new ManualScheduler();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FRAME_SCHEDULER, useValue: scheduler },
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) =>
            new FakeEventSource(url) as unknown as EventSource,
        },
      ],
    });
    store = TestBed.inject(LinkDetailStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Drain the fleet snapshot the store triggers to power live updates. */
  function flushFleet(links = [view('link-1')]): void {
    http.expectOne('/api/links').flush(links);
    http.expectOne('/api/fleet/summary').flush(summary);
  }

  function flushDetail(
    id = 'link-1',
    samples: TelemetrySample[] = [],
  ): void {
    http.expectOne(`/api/links/${id}`).flush(view(id));
    http.expectOne(`/api/links/${id}/telemetry`).flush({
      linkId: id,
      windowMs: 300000,
      count: samples.length,
      samples,
    });
  }

  it('loads the detail snapshot and telemetry history into signal state', () => {
    store.load('link-1');
    flushFleet();
    flushDetail('link-1', [sample('2026-08-05T09:00:00.000Z', 100)]);

    expect(store.state()).toBe('ready');
    expect(store.link()?.name).toBe('link-1');
    expect(store.series()).toHaveLength(1);
    expect(store.series()[0].throughputMbps).toBe(100);
  });

  it('maps a 404 to the not-found state', () => {
    store.load('ghost');
    flushFleet();
    http.expectOne('/api/links/ghost').flush(
      { error: { code: 'LINK_NOT_FOUND', message: 'Unknown link' } },
      { status: 404, statusText: 'Not Found' },
    );
    // forkJoin cancels the sibling telemetry request on error.
    http.match((r) => r.url === '/api/links/ghost/telemetry').forEach((r) => {
      if (!r.cancelled) r.flush({ linkId: 'ghost', windowMs: 0, count: 0, samples: [] });
    });
    expect(store.state()).toBe('not-found');
  });

  it('maps a non-404 failure to the error state', () => {
    store.load('link-1');
    flushFleet();
    http.expectOne('/api/links/link-1').flush('boom', { status: 500, statusText: 'Server Error' });
    http.match((r) => r.url === '/api/links/link-1/telemetry').forEach((r) => {
      if (!r.cancelled) r.flush({ linkId: 'link-1', windowMs: 0, count: 0, samples: [] });
    });
    expect(store.state()).toBe('error');
    expect(store.error()).toContain('500');
  });

  it('folds a live telemetry sample from the shared stream into the series', () => {
    store.load('link-1');
    flushFleet();
    flushDetail('link-1', [sample('2026-08-05T09:00:00.000Z', 100)]);

    const es = FakeEventSource.last;
    expect(es).toBeDefined();
    es?.emit('link.telemetry', sample('2026-08-05T09:00:01.000Z', 180));
    scheduler.flush(); // fleet store folds the batch → rows() updates
    TestBed.tick(); // run the detail store's live-append effect

    expect(store.series()).toHaveLength(2);
    expect(store.series()[1].throughputMbps).toBe(180);
    expect(store.latestSample()?.throughputMbps).toBe(180);
  });

  it('seeds the series from history bounded to the sparkline window', () => {
    const many: TelemetrySample[] = Array.from({ length: 80 }, (_, i) =>
      sample(`2026-08-05T09:${String(i).padStart(2, '0')}:00.000Z`, i),
    );
    store.load('link-1');
    flushFleet();
    flushDetail('link-1', many);
    expect(store.series().length).toBe(60); // SPARKLINE_MAX_POINTS
    expect(store.series()[59].throughputMbps).toBe(79); // most recent kept
  });

  describe('deleteLink (M7)', () => {
    let fleet: FleetStore;

    /** Put the store into a loaded state so it has a current link id. */
    function loaded(): void {
      store.load('link-1');
      flushFleet();
      flushDetail('link-1');
    }

    function expectDelete(id = 'link-1') {
      return http.expectOne((r) => r.method === 'DELETE' && r.url === `/api/links/${id}`);
    }

    beforeEach(() => {
      fleet = TestBed.inject(FleetStore);
    });

    it('deletes successfully: sets deleting during the request, then clears it', async () => {
      loaded();
      const removeSpy = jest.spyOn(fleet, 'removeLink');

      const done = store.deleteLink();
      expect(store.deleting()).toBe(true); // in flight

      expectDelete().flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(removeSpy).toHaveBeenCalledWith('link-1');
      expect(store.deleting()).toBe(false);
      expect(store.deleteError()).toBeNull();
    });

    it('treats a 404 as already gone: resolves and still prunes the fleet', async () => {
      loaded();
      const removeSpy = jest.spyOn(fleet, 'removeLink');

      const done = store.deleteLink();
      expectDelete().flush(
        { error: { code: 'LINK_NOT_FOUND', message: 'Unknown link' } },
        { status: 404, statusText: 'Not Found' },
      );
      await expect(done).resolves.toBeUndefined();

      expect(removeSpy).toHaveBeenCalledWith('link-1');
      expect(store.deleting()).toBe(false);
      expect(store.deleteError()).toBeNull();
    });

    it('surfaces a network failure as a readable deleteError and rejects', async () => {
      loaded();
      const removeSpy = jest.spyOn(fleet, 'removeLink');

      const done = store.deleteLink();
      expectDelete().error(new ProgressEvent('error'), {
        status: 0,
        statusText: 'Unknown Error',
      });
      await expect(done).rejects.toBeDefined();

      expect(removeSpy).not.toHaveBeenCalled();
      expect(store.deleting()).toBe(false);
      expect(store.deleteError()).toBe('Could not reach the API.');
    });

    it('surfaces a 5xx as a readable deleteError and rejects', async () => {
      loaded();
      const done = store.deleteLink();
      expectDelete().flush(
        { error: { code: 'INTERNAL', message: 'Internal server error' } },
        { status: 500, statusText: 'Server Error' },
      );
      await expect(done).rejects.toBeDefined();

      expect(store.deleting()).toBe(false);
      expect(store.deleteError()).toBe('Internal server error');
    });

    it('does nothing when no link is loaded', async () => {
      await expect(store.deleteLink()).resolves.toBeUndefined();
      expect(store.deleting()).toBe(false);
      http.expectNone((r) => r.method === 'DELETE');
    });
  });
});
