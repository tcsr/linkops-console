import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { linkId, type FleetSummary } from '@linkops/domain';
import { FleetStore } from './fleet-store';
import type { FleetLinkView } from './fleet-model';
import {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
  type FrameScheduler,
} from './stream-tokens';

/** Fake EventSource: capture listeners and drive frames from the test. */
class FakeEventSource {
  static last: FakeEventSource | undefined;
  readonly listeners = new Map<string, (ev: MessageEvent) => void>();
  onerror: ((ev: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
    this.listeners.set(type, cb);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  open(): void {
    this.listeners.get('open')?.({} as MessageEvent);
  }
  fail(): void {
    this.onerror?.({} as Event);
  }
}

/** Manual frame scheduler: the test decides when a coalesced flush runs. */
class ManualScheduler implements FrameScheduler {
  scheduleCount = 0;
  private pending: (() => void) | null = null;
  schedule(callback: () => void): number {
    this.scheduleCount++;
    this.pending = callback;
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
  get hasPending(): boolean {
    return this.pending !== null;
  }
}

function currentSource(): FakeEventSource {
  const source = FakeEventSource.last;
  if (source === undefined) {
    throw new Error('no EventSource was created');
  }
  return source;
}

const summary: FleetSummary = {
  total: 2,
  up: 2,
  degraded: 0,
  down: 0,
  avgThroughputMbps: 100,
  worstLinkId: null,
};

function view(id: string, status: 'up' | 'degraded' | 'down' = 'up'): FleetLinkView {
  return {
    id: linkId(id),
    name: id,
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    mode: 'PtP',
    channelWidthMhz: 40,
    capacityMbps: 100,
    txPowerDbm: 20,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status,
    latestSample: null,
  };
}

describe('FleetStore', () => {
  let store: FleetStore;
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
          useValue: (url: string) => new FakeEventSource(url) as unknown as EventSource,
        },
      ],
    });
    store = TestBed.inject(FleetStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function loadSnapshot(links = [view('link-1'), view('link-2')]): void {
    store.load();
    http.expectOne('/links').flush(links);
    http.expectOne('/fleet/summary').flush(summary);
  }

  it('loads the REST snapshot into signal state', () => {
    expect(store.status()).toBe('idle');
    loadSnapshot();
    expect(store.status()).toBe('ready');
    expect(store.rows()).toHaveLength(2);
    expect(store.summary()?.total).toBe(2);
    expect(store.isEmpty()).toBe(false);
  });

  it('reports an empty fleet', () => {
    loadSnapshot([]);
    expect(store.status()).toBe('ready');
    expect(store.isEmpty()).toBe(true);
  });

  it('surfaces a REST failure as an error state with a message', () => {
    store.load();
    http.expectOne('/links').flush('nope', { status: 500, statusText: 'Server Error' });
    // forkJoin cancels the sibling request when /links errors; drain it if the
    // cancellation has not already removed it.
    http
      .match((r) => r.url === '/fleet/summary')
      .forEach((r) => {
        if (!r.cancelled) {
          r.flush(summary);
        }
      });
    expect(store.status()).toBe('error');
    expect(store.error()).toContain('500');
  });

  it('coalesces a burst of SSE events into a single flushed update', () => {
    loadSnapshot();
    store.connect();
    const es = currentSource();
    es.open();
    expect(store.connection()).toBe('open');

    // three frames before any flush → scheduled exactly once
    es.emit('link.telemetry', {
      linkId: 'link-1', ts: '2026-08-05T09:00:01.000Z', rssiDbm: -55, snrDb: 25, throughputMbps: 40,
    });
    es.emit('link.telemetry', {
      linkId: 'link-2', ts: '2026-08-05T09:00:01.000Z', rssiDbm: -55, snrDb: 25, throughputMbps: 60,
    });
    es.emit('link.status', { linkId: 'link-1', status: 'degraded', previous: 'up' });

    expect(scheduler.scheduleCount).toBe(1); // coalesced
    expect(store.rows().find((r) => r.id === 'link-1')?.latestSample).toBeNull(); // not applied yet

    scheduler.flush();
    const row1 = store.rows().find((r) => r.id === 'link-1');
    expect(row1?.latestSample?.throughputMbps).toBe(40);
    expect(row1?.status).toBe('degraded');
    expect(store.rows().find((r) => r.id === 'link-2')?.latestSample?.throughputMbps).toBe(60);
  });

  it('applies a fleet.summary event', () => {
    loadSnapshot();
    store.connect();
    const es = currentSource();
    es.emit('fleet.summary', { total: 2, up: 1, degraded: 1, down: 0, avgThroughputMbps: 50, worstLinkId: 'link-1' });
    scheduler.flush();
    expect(store.summary()?.degraded).toBe(1);
  });

  it('reflects reconnect state and returns to open', () => {
    loadSnapshot();
    store.connect();
    const es = currentSource();
    es.open();
    expect(store.connection()).toBe('open');
    es.fail(); // transient disconnect; native EventSource auto-reconnects
    expect(store.connection()).toBe('reconnecting');
    es.open(); // reconnected
    expect(store.connection()).toBe('open');
  });

  it('closes the EventSource and cancels pending frames on destroy', () => {
    loadSnapshot();
    store.connect();
    const es = currentSource();
    es.emit('link.telemetry', {
      linkId: 'link-1', ts: '2026-08-05T09:00:01.000Z', rssiDbm: -55, snrDb: 25, throughputMbps: 40,
    });
    expect(scheduler.hasPending).toBe(true);

    TestBed.resetTestingModule(); // triggers DestroyRef teardown

    expect(es.closed).toBe(true);
    expect(scheduler.hasPending).toBe(false);
  });

  it('does not open a second EventSource on repeated connect()', () => {
    loadSnapshot();
    store.connect();
    const first = currentSource();
    store.connect();
    expect(FakeEventSource.last).toBe(first); // no new source created
  });
});
