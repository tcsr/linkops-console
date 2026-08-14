import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { linkId, type FleetSummary, type TelemetrySample } from '@linkops/domain';
import {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
  LinkDetailStore,
  type FleetLinkView,
  type FrameScheduler,
} from '@linkops/console-data-access';
import { LinkDetailView } from './link-detail-view';

class NoopScheduler implements FrameScheduler {
  schedule(cb: () => void): number {
    cb();
    return 1;
  }
  cancel(): void {
    /* noop */
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
    name: 'HQ Link',
    siteA: 'HQ Rooftop',
    siteB: 'North Tower',
    band: '11GHz',
    mode: 'PtP',
    channelWidthMhz: 80,
    capacityMbps: 500,
    txPowerDbm: 22,
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'degraded',
    latestSample: null,
  };
}

function sample(throughput: number): TelemetrySample {
  return {
    linkId: 'link-1',
    ts: '2026-08-05T09:00:00.000Z',
    rssiDbm: -60,
    snrDb: 15,
    throughputMbps: throughput,
  };
}

describe('LinkDetailView', () => {
  let http: HttpTestingController;

  function setup(id: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {} },
        { provide: FRAME_SCHEDULER, useValue: new NoopScheduler() },
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: () =>
            ({
              addEventListener: () => undefined,
              close: () => undefined,
              onerror: null,
            }) as unknown as EventSource,
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LinkDetailView);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges(); // runs the load effect
    return fixture;
  }

  afterEach(() => http.verify());

  function flushFleet(): void {
    http.expectOne('/api/links').flush([view('link-1')]);
    http.expectOne('/api/fleet/summary').flush(summary);
  }

  it('renders the link config, live status and current throughput', () => {
    const fixture = setup('link-1');
    flushFleet();
    http.expectOne('/api/links/link-1').flush(view('link-1'));
    http.expectOne('/api/links/link-1/telemetry').flush({
      linkId: 'link-1',
      windowMs: 300000,
      count: 1,
      samples: [sample(320)],
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('HQ Link');
    expect(text).toContain('11GHz'); // band attribute
    expect(text).toContain('320'); // current throughput
    // live/derived status badge present
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('lo-status-badge'),
    ).not.toBeNull();
  });

  it('shows a not-found state for an unknown link id', () => {
    const fixture = setup('ghost');
    flushFleet();
    http.expectOne('/api/links/ghost').flush(
      { error: { code: 'LINK_NOT_FOUND', message: 'Unknown' } },
      { status: 404, statusText: 'Not Found' },
    );
    http.match((r) => r.url === '/api/links/ghost/telemetry').forEach((r) => {
      if (!r.cancelled) r.flush({ linkId: 'ghost', windowMs: 0, count: 0, samples: [] });
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Link not found',
    );
  });

  describe('delete confirmation UX (M7)', () => {
    /** Bring a fixture to the loaded/default state so the header renders. */
    function loadDetail(id = 'link-1') {
      const fixture = setup(id);
      flushFleet();
      http.expectOne(`/api/links/${id}`).flush(view(id));
      http.expectOne(`/api/links/${id}/telemetry`).flush({
        linkId: id,
        windowMs: 300000,
        count: 0,
        samples: [],
      });
      fixture.detectChanges();
      return fixture;
    }

    const el = (fixture: { nativeElement: unknown }) =>
      fixture.nativeElement as HTMLElement;
    const q = (fixture: { nativeElement: unknown }, sel: string) =>
      el(fixture).querySelector(sel) as HTMLElement | null;
    const deleteReqs = () => http.match((r) => r.method === 'DELETE');
    // Zoneless: fixture.whenStable() does not await our promise chain, so drain
    // the microtask queue via a macrotask boundary for deterministic assertions.
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    it('renders a Delete action in the header', () => {
      const fixture = loadDetail();
      expect(q(fixture, '.del')).not.toBeNull();
      expect(q(fixture, '.del')?.textContent).toContain('Delete');
    });

    it('clicking Delete enters the confirmation state without calling the store', () => {
      const fixture = loadDetail();
      const spy = jest.spyOn(TestBed.inject(LinkDetailStore), 'deleteLink');

      q(fixture, '.del')?.click();
      fixture.detectChanges();

      expect(q(fixture, '.confirm-yes')).not.toBeNull();
      expect(q(fixture, '.confirm-no')).not.toBeNull();
      expect(q(fixture, '.del')).toBeNull(); // Delete swapped for confirm controls
      expect(spy).not.toHaveBeenCalled();
    });

    it('clicking Cancel exits confirmation without calling the store', () => {
      const fixture = loadDetail();
      const spy = jest.spyOn(TestBed.inject(LinkDetailStore), 'deleteLink');

      q(fixture, '.del')?.click();
      fixture.detectChanges();
      q(fixture, '.confirm-no')?.click();
      fixture.detectChanges();

      expect(q(fixture, '.del')).not.toBeNull(); // back to normal
      expect(q(fixture, '.confirm-yes')).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it('clicking Confirm calls deleteLink and navigates to / on success', async () => {
      const fixture = loadDetail();
      const router = TestBed.inject(Router);
      const nav = jest.spyOn(router, 'navigate').mockResolvedValue(true);
      const del = jest.spyOn(TestBed.inject(LinkDetailStore), 'deleteLink');

      q(fixture, '.del')?.click();
      fixture.detectChanges();
      q(fixture, '.confirm-yes')?.click();

      expect(del).toHaveBeenCalledTimes(1);
      // in-flight: deleting state disables the confirm button
      fixture.detectChanges();
      expect((q(fixture, '.confirm-yes') as HTMLButtonElement).disabled).toBe(true);

      http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/links/link-1')
        .flush(null, { status: 204, statusText: 'No Content' });
      await tick();

      expect(nav).toHaveBeenCalledWith(['/']);
    });

    it('prevents a duplicate DELETE while one is in flight', async () => {
      const fixture = loadDetail();
      jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      q(fixture, '.del')?.click();
      fixture.detectChanges();
      // Two confirms back-to-back; the second must be a no-op (guard + disabled).
      q(fixture, '.confirm-yes')?.click();
      q(fixture, '.confirm-yes')?.click();

      const reqs = deleteReqs();
      expect(reqs).toHaveLength(1);
      reqs[0].flush(null, { status: 204, statusText: 'No Content' });
      await tick();
    });

    it('navigates to / when the link was already gone (store resolves on 404)', async () => {
      const fixture = loadDetail();
      const nav = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      q(fixture, '.del')?.click();
      fixture.detectChanges();
      q(fixture, '.confirm-yes')?.click();

      http.expectOne((r) => r.method === 'DELETE').flush(
        { error: { code: 'LINK_NOT_FOUND', message: 'Unknown link' } },
        { status: 404, statusText: 'Not Found' },
      );
      await tick();

      expect(nav).toHaveBeenCalledWith(['/']);
    });

    it('stays on the page and renders a readable error on delete failure', async () => {
      const fixture = loadDetail();
      const nav = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      q(fixture, '.del')?.click();
      fixture.detectChanges();
      q(fixture, '.confirm-yes')?.click();

      http.expectOne((r) => r.method === 'DELETE').flush(
        { error: { code: 'INTERNAL', message: 'Internal server error' } },
        { status: 500, statusText: 'Server Error' },
      );
      await tick();
      fixture.detectChanges();

      expect(nav).not.toHaveBeenCalled();
      const text = el(fixture).textContent ?? '';
      expect(text).toContain('Delete failed.');
      expect(text).toContain('Internal server error');
      expect(text).not.toContain('HttpErrorResponse');
      // confirmation stays open so the user can retry
      expect(q(fixture, '.confirm-yes')).not.toBeNull();
    });

    it('allows a retry after a failure', async () => {
      const fixture = loadDetail();
      const nav = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      q(fixture, '.del')?.click();
      fixture.detectChanges();

      // First attempt fails.
      q(fixture, '.confirm-yes')?.click();
      http.expectOne((r) => r.method === 'DELETE').flush(
        { error: { code: 'INTERNAL', message: 'Internal server error' } },
        { status: 500, statusText: 'Server Error' },
      );
      await tick();
      fixture.detectChanges();

      // Retry succeeds.
      q(fixture, '.confirm-yes')?.click();
      http.expectOne((r) => r.method === 'DELETE').flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await tick();

      expect(nav).toHaveBeenCalledWith(['/']);
    });
  });
});
