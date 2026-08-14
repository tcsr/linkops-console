import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { FleetApi } from './fleet-api';
import type { CreateLinkPayload, UpdateLinkPayload } from './link-detail-model';

describe('FleetApi (detail + mutations)', () => {
  let api: FleetApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(FleetApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /links/:id', () => {
    api.linkById('link-1').subscribe();
    const req = http.expectOne('/links/link-1');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('omits windowMs when not provided', () => {
    api.telemetry('link-1').subscribe();
    const req = http.expectOne('/links/link-1/telemetry');
    expect(req.request.params.has('windowMs')).toBe(false);
    req.flush({ linkId: 'link-1', windowMs: 0, count: 0, samples: [] });
  });

  it('passes windowMs as a query param when provided', () => {
    api.telemetry('link-1', 60000).subscribe();
    const req = http.expectOne((r) => r.url === '/links/link-1/telemetry');
    expect(req.request.params.get('windowMs')).toBe('60000');
    req.flush({ linkId: 'link-1', windowMs: 60000, count: 0, samples: [] });
  });

  it('POST /links with the create payload', () => {
    const payload: CreateLinkPayload = {
      name: 'X',
      siteA: 'A',
      siteB: 'B',
      band: '5GHz',
      mode: 'PtP',
      channelWidthMhz: 40,
      capacityMbps: 100,
      txPowerDbm: 10,
    };
    api.create(payload).subscribe();
    const req = http.expectOne('/links');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it('PATCH /links/:id with expectedVersion', () => {
    const payload: UpdateLinkPayload = { expectedVersion: 4, name: 'Y' };
    api.update('link-1', payload).subscribe();
    const req = http.expectOne('/links/link-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });
});
