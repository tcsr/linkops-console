import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { linkId, type FleetSummary } from '@linkops/domain';
import {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
  type FleetLinkView,
  type FrameScheduler,
} from '@linkops/console-data-access';
import { FleetView } from './fleet-view';

class NoopScheduler implements FrameScheduler {
  schedule(cb: () => void): number {
    cb();
    return 1;
  }
  cancel(): void {
    /* no pending frame retained */
  }
}

function view(id: string, status: 'up' | 'degraded' | 'down'): FleetLinkView {
  return {
    id: linkId(id),
    name: id,
    siteA: 'Alpha',
    siteB: 'Beta',
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

const summary: FleetSummary = {
  total: 2,
  up: 1,
  degraded: 0,
  down: 1,
  avgThroughputMbps: 50,
  worstLinkId: linkId('beta'),
};

describe('FleetView', () => {
  let http: HttpTestingController;

  function setup() {
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
    const fixture = TestBed.createComponent(FleetView); // constructor loads + connects
    return fixture;
  }

  afterEach(() => {
    http.verify();
  });

  function flushSnapshot(links: FleetLinkView[]): void {
    http.expectOne('/links').flush(links);
    http.expectOne('/fleet/summary').flush(summary);
  }

  it('shows a loading message before the snapshot resolves', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading fleet');
    flushSnapshot([view('alpha', 'up')]); // drain to satisfy http.verify
  });

  it('renders the live fleet rows and the KPI header after loading', () => {
    const fixture = setup();
    flushSnapshot([view('alpha', 'up'), view('beta', 'down')]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
    expect(text).toContain('Total'); // KPI header
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
  });

  it('filters rows by the URL-bound status input', () => {
    const fixture = setup();
    flushSnapshot([view('alpha', 'up'), view('beta', 'down')]);
    fixture.componentRef.setInput('status', 'down'); // simulates ?status=down
    fixture.detectChanges();

    const bodyRows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('beta');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('alpha');
  });

  it('shows an empty message when the fleet is empty', () => {
    const fixture = setup();
    flushSnapshot([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No links in the fleet');
  });

  it('shows an error message when the snapshot request fails', () => {
    const fixture = setup();
    http.expectOne('/links').flush('boom', { status: 500, statusText: 'Server Error' });
    http.match((r) => r.url === '/fleet/summary').forEach((r) => {
      if (!r.cancelled) r.flush(summary);
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Request failed');
  });
});
