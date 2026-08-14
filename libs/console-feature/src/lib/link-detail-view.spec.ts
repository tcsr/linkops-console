import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { linkId, type FleetSummary, type TelemetrySample } from '@linkops/domain';
import {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
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
    http.expectOne('/links').flush([view('link-1')]);
    http.expectOne('/fleet/summary').flush(summary);
  }

  it('renders the link config, live status and current throughput', () => {
    const fixture = setup('link-1');
    flushFleet();
    http.expectOne('/links/link-1').flush(view('link-1'));
    http.expectOne('/links/link-1/telemetry').flush({
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
    http.expectOne('/links/ghost').flush(
      { error: { code: 'LINK_NOT_FOUND', message: 'Unknown' } },
      { status: 404, statusText: 'Not Found' },
    );
    http.match((r) => r.url === '/links/ghost/telemetry').forEach((r) => {
      if (!r.cancelled) r.flush({ linkId: 'ghost', windowMs: 0, count: 0, samples: [] });
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Link not found',
    );
  });
});
