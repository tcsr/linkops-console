import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { linkId } from '@linkops/domain';
import type { FleetLinkView } from '@linkops/console-data-access';
import { LinkFormView } from './link-form-view';

function created(id: string): FleetLinkView {
  return {
    id: linkId(id),
    name: 'My Link',
    siteA: 'Site A',
    siteB: 'Site B',
    band: '5GHz',
    mode: 'PtP',
    channelWidthMhz: 40,
    capacityMbps: 200,
    txPowerDbm: 20,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'up',
    latestSample: null,
  };
}

describe('LinkFormView', () => {
  let http: HttpTestingController;
  let router: Router;

  function setup(id?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LinkFormView);
    if (id !== undefined) {
      fixture.componentRef.setInput('id', id);
    }
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  function setInput(el: HTMLElement, name: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`);
    if (input === null) {
      throw new Error(`no control ${name}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function submit(el: HTMLElement): void {
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
  }

  function fillValid(el: HTMLElement): void {
    setInput(el, 'name', 'New Radio Link');
    setInput(el, 'siteA', 'Tower A');
    setInput(el, 'siteB', 'Tower B');
  }

  it('starts a create form with default values and no prefill request', () => {
    const fixture = setup();
    // No GET should fire in create mode.
    http.expectNone(() => true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('New link');
  });

  it('blocks submission of an invalid form (no POST)', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    submit(el); // name/siteA/siteB empty → invalid
    http.expectNone((r) => r.method === 'POST');
  });

  it('creates a link with a valid payload and navigates to its detail', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    fillValid(el);
    fixture.detectChanges();
    submit(el);

    const req = http.expectOne('/links');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('New Radio Link');
    req.flush(created('new-1'));

    expect(router.navigate).toHaveBeenCalledWith(['/links', 'new-1']);
  });

  it('prefills the edit form and PATCHes with the expected version', () => {
    const fixture = setup('link-1');
    http.expectOne('/links/link-1').flush(created('link-1')); // version 1
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    setInput(el, 'name', 'Renamed Link');
    fixture.detectChanges();
    submit(el);

    const req = http.expectOne('/links/link-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.expectedVersion).toBe(1);
    expect(req.request.body.name).toBe('Renamed Link');
    req.flush({ ...created('link-1'), name: 'Renamed Link', version: 2 });

    expect(router.navigate).toHaveBeenCalledWith(['/links', 'link-1']);
  });

  it('surfaces a save failure without navigating', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    fillValid(el);
    fixture.detectChanges();
    submit(el);

    http.expectOne('/links').flush(
      { error: { code: 'DUPLICATE_LINK_NAME', message: 'Name already in use' } },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Save failed');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Name already in use',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('guards against duplicate submission while a save is in flight', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    fillValid(el);
    fixture.detectChanges();
    submit(el);
    submit(el); // second click while the first is pending

    const matches = http.match('/links');
    expect(matches).toHaveLength(1); // only one POST issued
    matches[0].flush(created('new-1'));
  });
});
