import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BANDS,
  CAPACITY_MBPS,
  CHANNEL_WIDTHS,
  LINK_NAME_CONSTRAINTS,
  MODES,
  SITE_LENGTH,
  TX_POWER_DBM,
} from '@linkops/domain';
import {
  FleetApi,
  parseApiError,
  type CreateLinkPayload,
  type UpdateLinkPayload,
} from '@linkops/console-data-access';

/** Prefill/save lifecycle for the form. */
type FormState = 'ready' | 'loading' | 'load-error';

/** Editable field names (used for per-field error display). */
type FormFieldName =
  | 'name'
  | 'siteA'
  | 'siteB'
  | 'band'
  | 'mode'
  | 'channelWidthMhz'
  | 'capacityMbps'
  | 'txPowerDbm';

/**
 * Create/edit link form (M6). Route `/links/new` (create) and
 * `/links/:id/edit` (edit); the optional `id` input decides the mode. The form
 * is strongly typed and its client-side validators mirror the server rules
 * (shared domain constants) — the server still enforces them, and a rejected
 * save surfaces a readable message. Optimistic concurrency: edit sends the
 * loaded `version` as `expectedVersion`; the 409 *resolution* UX is M7's.
 */
@Component({
  selector: 'app-link-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <a class="back" [routerLink]="backLink()">← {{ isEdit() ? 'Link' : 'Fleet' }}</a>

    <header class="head">
      <h1>{{ isEdit() ? 'Edit link' : 'New link' }}</h1>
      <p class="sub">
        {{ isEdit() ? 'Update configuration. Status is derived, not editable.' : 'Provision a new point-to-point link.' }}
      </p>
    </header>

    @switch (state()) {
      @case ('loading') {
        <div class="skeleton" aria-busy="true"><span class="sr">Loading link…</span></div>
      }
      @case ('load-error') {
        <div class="msg error" role="alert">
          <strong>Could not load this link.</strong>
          <span>{{ loadError() }}</span>
        </div>
      }
      @default {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="grid">
            <label class="field span-2">
              <span class="lbl">Name</span>
              <input formControlName="name" type="text" autocomplete="off" />
              @if (showError('name')) {
                <span class="err">Name must be {{ nameMin }}–{{ nameMax }} characters.</span>
              }
            </label>

            <label class="field">
              <span class="lbl">Site A</span>
              <input formControlName="siteA" type="text" autocomplete="off" />
              @if (showError('siteA')) {
                <span class="err">Required (max {{ siteMax }} characters).</span>
              }
            </label>

            <label class="field">
              <span class="lbl">Site B</span>
              <input formControlName="siteB" type="text" autocomplete="off" />
              @if (showError('siteB')) {
                <span class="err">Required (max {{ siteMax }} characters).</span>
              }
            </label>

            <label class="field">
              <span class="lbl">Band</span>
              <select formControlName="band">
                @for (b of bands; track b) {
                  <option [ngValue]="b">{{ b }}</option>
                }
              </select>
            </label>

            <label class="field">
              <span class="lbl">Mode</span>
              <select formControlName="mode">
                @for (m of modes; track m) {
                  <option [ngValue]="m">{{ m }}</option>
                }
              </select>
            </label>

            <label class="field">
              <span class="lbl">Channel width (MHz)</span>
              <select formControlName="channelWidthMhz">
                @for (w of widths; track w) {
                  <option [ngValue]="w">{{ w }}</option>
                }
              </select>
            </label>

            <label class="field">
              <span class="lbl">Capacity (Mbps)</span>
              <input formControlName="capacityMbps" type="number" [min]="capMin" [max]="capMax" />
              @if (showError('capacityMbps')) {
                <span class="err">Must be {{ capMin }}–{{ capMax }}.</span>
              }
            </label>

            <label class="field">
              <span class="lbl">Tx power (dBm)</span>
              <input formControlName="txPowerDbm" type="number" [min]="txMin" [max]="txMax" />
              @if (showError('txPowerDbm')) {
                <span class="err">Must be {{ txMin }}–{{ txMax }}.</span>
              }
            </label>
          </div>

          @if (saveError()) {
            <div class="msg error" role="alert">
              <strong>Save failed.</strong>
              <span>{{ saveError() }}</span>
            </div>
          }

          <div class="actions">
            <a class="btn ghost" [routerLink]="backLink()">Cancel</a>
            <button class="btn primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'Saving…' : (isEdit() ? 'Save changes' : 'Create link') }}
            </button>
          </div>
        </form>
      }
    }
  `,
  styles: `
    :host { display: block; padding: 1rem 1.5rem 2.5rem; max-width: 48rem; margin: 0 auto; }
    .back { display: inline-block; font-size: 0.82rem; font-weight: 700; color: var(--muted); text-decoration: none; margin-bottom: 1rem; }
    .back:hover { color: var(--accent); }
    .head { margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em; color: var(--text); }
    .sub { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--muted); }

    form {
      background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 1.5rem; box-shadow: var(--shadow);
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; }
    .span-2 { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 0.35rem; }
    .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
    input, select {
      font: inherit; font-size: 0.9rem; color: var(--text);
      background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 0.55rem 0.7rem; height: 2.5rem; transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    input:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .field.ng-invalid input, .field.ng-invalid select { /* no-op; per-control below */ }
    input.ng-invalid.ng-touched, select.ng-invalid.ng-touched { border-color: color-mix(in srgb, var(--down) 45%, var(--border)); }
    .err { font-size: 0.72rem; color: var(--down); font-weight: 600; }

    .actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
    .btn {
      font: inherit; font-size: 0.85rem; font-weight: 700; cursor: pointer;
      padding: 0.55rem 1.1rem; border-radius: var(--radius-sm); border: 1px solid transparent;
      text-decoration: none; display: inline-flex; align-items: center; transition: all 0.2s ease;
    }
    .btn.ghost { color: var(--muted); background: var(--panel-2); border-color: var(--border); }
    .btn.ghost:hover { color: var(--text); border-color: var(--border-strong); }
    .btn.primary {
      color: #fff; background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 70%, #ff9a3d));
      box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--brand) 60%, transparent);
    }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn.primary:disabled { opacity: 0.6; cursor: progress; }
    .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .msg { margin-top: 1.25rem; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.9rem 1.1rem; border-radius: var(--radius-sm); font-size: 0.85rem; }
    .msg.error { color: var(--down); border: 1px solid color-mix(in srgb, var(--down) 30%, transparent); background: color-mix(in srgb, var(--down) 5%, var(--panel-2)); }
    .msg strong { font-weight: 700; }

    .skeleton { height: 12rem; border-radius: var(--radius); border: 1px solid var(--border);
      background: linear-gradient(90deg, var(--panel) 25%, var(--panel-2) 50%, var(--panel) 75%);
      background-size: 200% 100%; animation: shimmer 1.6s infinite linear; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

    @media (max-width: 32rem) { .grid { grid-template-columns: 1fr; } .span-2 { grid-column: auto; } }
  `,
})
export class LinkFormView {
  private readonly api = inject(FleetApi);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param `:id` when editing; absent when creating. */
  readonly id = input<string>();

  protected readonly isEdit = computed(() => this.id() !== undefined);
  protected readonly state = signal<FormState>('ready');
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /** Loaded version for optimistic concurrency (edit only). */
  private readonly version = signal<number | null>(null);

  // Template constants (mirror the shared domain rules).
  protected readonly bands = BANDS;
  protected readonly modes = MODES;
  protected readonly widths = CHANNEL_WIDTHS;
  protected readonly nameMin = LINK_NAME_CONSTRAINTS.minLength;
  protected readonly nameMax = LINK_NAME_CONSTRAINTS.maxLength;
  protected readonly siteMax = SITE_LENGTH.max;
  protected readonly capMin = CAPACITY_MBPS.min;
  protected readonly capMax = CAPACITY_MBPS.max;
  protected readonly txMin = TX_POWER_DBM.min;
  protected readonly txMax = TX_POWER_DBM.max;

  protected readonly form = this.fb.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(LINK_NAME_CONSTRAINTS.minLength),
        Validators.maxLength(LINK_NAME_CONSTRAINTS.maxLength),
      ],
    ],
    siteA: ['', [Validators.required, Validators.maxLength(SITE_LENGTH.max)]],
    siteB: ['', [Validators.required, Validators.maxLength(SITE_LENGTH.max)]],
    band: [BANDS[0], [Validators.required]],
    mode: [MODES[0], [Validators.required]],
    channelWidthMhz: [CHANNEL_WIDTHS[1], [Validators.required]],
    capacityMbps: [
      CAPACITY_MBPS.min as number,
      [
        Validators.required,
        Validators.min(CAPACITY_MBPS.min),
        Validators.max(CAPACITY_MBPS.max),
      ],
    ],
    txPowerDbm: [
      TX_POWER_DBM.max as number,
      [
        Validators.required,
        Validators.min(TX_POWER_DBM.min),
        Validators.max(TX_POWER_DBM.max),
      ],
    ],
  });

  protected readonly backLink = computed(() => {
    const id = this.id();
    return id === undefined ? ['/'] : ['/links', id];
  });

  private lastPrefilled: string | null = null;

  constructor() {
    effect(() => {
      const id = this.id();
      if (id !== undefined && id !== this.lastPrefilled) {
        this.lastPrefilled = id;
        this.prefill(id);
      }
    });
  }

  /** Load the existing link into the form and capture its version. */
  private prefill(id: string): void {
    this.state.set('loading');
    this.loadError.set(null);
    this.api
      .linkById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (link) => {
          if (this.id() !== id) {
            return;
          }
          this.version.set(link.version);
          this.form.setValue({
            name: link.name,
            siteA: link.siteA,
            siteB: link.siteB,
            band: link.band,
            mode: link.mode,
            channelWidthMhz: link.channelWidthMhz,
            capacityMbps: link.capacityMbps,
            txPowerDbm: link.txPowerDbm,
          });
          this.state.set('ready');
        },
        error: (err: unknown) => {
          if (this.id() !== id) {
            return;
          }
          this.loadError.set(parseApiError(err).message);
          this.state.set('load-error');
        },
      });
  }

  protected showError(control: FormFieldName): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  protected submit(): void {
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) {
      return; // guard against duplicate submission
    }
    this.saving.set(true);
    const value = this.form.getRawValue();

    const id = this.id();
    if (id === undefined) {
      const payload: CreateLinkPayload = value;
      this.api
        .create(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (link) => this.onSaved(link.id),
          error: (err: unknown) => this.onSaveError(err),
        });
    } else {
      const expectedVersion = this.version() ?? 0;
      const payload: UpdateLinkPayload = { ...value, expectedVersion };
      this.api
        .update(id, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (link) => this.onSaved(link.id),
          error: (err: unknown) => this.onSaveError(err),
        });
    }
  }

  private onSaved(id: string): void {
    this.saving.set(false);
    void this.router.navigate(['/links', id]);
  }

  private onSaveError(err: unknown): void {
    this.saving.set(false);
    this.saveError.set(parseApiError(err).message);
  }
}
