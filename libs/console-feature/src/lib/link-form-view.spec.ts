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

    const req = http.expectOne('/api/links');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('New Radio Link');
    req.flush(created('new-1'));

    expect(router.navigate).toHaveBeenCalledWith(['/links', 'new-1']);
  });

  it('prefills the edit form and PATCHes with the expected version', () => {
    const fixture = setup('link-1');
    http.expectOne('/api/links/link-1').flush(created('link-1')); // version 1
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    setInput(el, 'name', 'Renamed Link');
    fixture.detectChanges();
    submit(el);

    const req = http.expectOne('/api/links/link-1');
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

    http.expectOne('/api/links').flush(
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

    const matches = http.match('/api/links');
    expect(matches).toHaveLength(1); // only one POST issued
    matches[0].flush(created('new-1'));
  });

  describe('version conflict resolution (M7)', () => {
    const conflictBody = (actualVersion: number) => ({
      error: {
        code: 'VERSION_CONFLICT',
        message: 'Link was modified by someone else',
        details: { expectedVersion: 1, actualVersion },
      },
    });

    const conflictBanner = (el: HTMLElement) =>
      el.querySelector('.msg.conflict');
    const conflictText = (el: HTMLElement) =>
      conflictBanner(el)?.textContent ?? '';
    const reloadBtn = (el: HTMLElement) =>
      el.querySelector('.msg.conflict .btn.primary') as HTMLButtonElement | null;
    const saveBtn = (el: HTMLElement) =>
      el.querySelector('.actions button[type="submit"]') as HTMLButtonElement;
    const nameValue = (el: HTMLElement) =>
      (el.querySelector('[formcontrolname="name"]') as HTMLInputElement).value;

    /** Drive an edit into the VERSION_CONFLICT state (initial version 1). */
    function editIntoConflict(actualVersion = 4) {
      const fixture = setup('link-1');
      http.expectOne('/api/links/link-1').flush(created('link-1')); // version 1
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      setInput(el, 'name', 'My Edit');
      fixture.detectChanges();
      submit(el);

      const patch = http.expectOne('/api/links/link-1');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body.expectedVersion).toBe(1);
      patch.flush(conflictBody(actualVersion), {
        status: 409,
        statusText: 'Conflict',
      });
      fixture.detectChanges();
      return { fixture, el };
    }

    it('renders a resolvable conflict (not a generic save error) with Reload latest', () => {
      const { el } = editIntoConflict(4);
      expect(el.textContent).not.toContain('Save failed'); // #1
      expect(conflictBanner(el)).not.toBeNull(); // #2
      expect(conflictText(el)).toContain('changed elsewhere'); // #3
      expect(conflictText(el)).toContain('stale');
      expect(conflictText(el)).toContain('v4'); // actualVersion from details
      expect(reloadBtn(el)?.textContent).toContain('Reload latest'); // #4
      expect(saveBtn(el).disabled).toBe(true); // stale save blocked
      expect(el.textContent).not.toContain('HttpErrorResponse');
    });

    it('blocks a stale re-submit while in conflict (old version not reused)', () => {
      const { el } = editIntoConflict();
      submit(el); // attempt to save again with the stale version
      http.expectNone((r) => r.method === 'PATCH'); // #9/#13: no stale PATCH
    });

    it('reload latest fetches, replaces stale values, updates version, clears conflict', () => {
      const { fixture, el } = editIntoConflict(4);

      reloadBtn(el)?.click();
      const get = http.expectOne('/api/links/link-1');
      expect(get.request.method).toBe('GET'); // #5
      get.flush({ ...created('link-1'), name: 'Server Renamed', version: 4 });
      fixture.detectChanges();

      expect(conflictBanner(el)).toBeNull(); // #8 conflict cleared
      expect(nameValue(el)).toBe('Server Renamed'); // #6 latest replaces stale
      expect(saveBtn(el).disabled).toBe(false); // #10 editable again
      expect(router.navigate).not.toHaveBeenCalled(); // #9 not auto-submitted
    });

    it('retries with the new version after reload and navigates on success', () => {
      const { fixture, el } = editIntoConflict(4);

      reloadBtn(el)?.click();
      http.expectOne('/api/links/link-1').flush({
        ...created('link-1'),
        name: 'Server Renamed',
        version: 4,
      });
      fixture.detectChanges();

      // user re-applies their change and saves again
      setInput(el, 'name', 'User Reapplied');
      fixture.detectChanges();
      submit(el);

      const patch = http.expectOne('/api/links/link-1');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body.expectedVersion).toBe(4); // #7/#11/#13 fresh version
      expect(patch.request.body.name).toBe('User Reapplied');
      patch.flush({ ...created('link-1'), name: 'User Reapplied', version: 5 });

      expect(router.navigate).toHaveBeenCalledWith(['/links', 'link-1']); // #12
    });

    it('surfaces a reload network failure and allows retrying the reload', () => {
      const { fixture, el } = editIntoConflict();

      reloadBtn(el)?.click();
      http.expectOne('/api/links/link-1').error(new ProgressEvent('error'), {
        status: 0,
        statusText: 'Unknown Error',
      });
      fixture.detectChanges();

      expect(conflictText(el)).toContain('Reload failed'); // #14
      expect(conflictText(el)).toContain('Could not reach the API.');
      expect(conflictBanner(el)).not.toBeNull(); // conflict stays open

      // #16 retry the reload — succeeds
      reloadBtn(el)?.click();
      http.expectOne('/api/links/link-1').flush({ ...created('link-1'), version: 4 });
      fixture.detectChanges();
      expect(conflictBanner(el)).toBeNull();
    });

    it('surfaces a 5xx reload failure readably (conflict stays open)', () => {
      const { fixture, el } = editIntoConflict();

      reloadBtn(el)?.click();
      http.expectOne('/api/links/link-1').flush(
        { error: { code: 'INTERNAL', message: 'Internal server error' } },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();

      expect(conflictText(el)).toContain('Reload failed'); // #15
      expect(conflictText(el)).toContain('Internal server error');
      expect(conflictBanner(el)).not.toBeNull();
    });

    it('keeps a duplicate-name 409 as a normal save error, not a version conflict', () => {
      const fixture = setup('link-1');
      http.expectOne('/api/links/link-1').flush(created('link-1'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      setInput(el, 'name', 'Taken Name');
      fixture.detectChanges();
      submit(el);

      http.expectOne('/api/links/link-1').flush(
        { error: { code: 'DUPLICATE_LINK_NAME', message: 'Name already in use' } },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      expect(el.textContent).toContain('Save failed'); // #17 generic error
      expect(el.textContent).toContain('Name already in use');
      expect(conflictBanner(el)).toBeNull(); // NOT the conflict UX
      expect(saveBtn(el).disabled).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
