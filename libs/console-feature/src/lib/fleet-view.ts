import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FleetStore } from '@linkops/console-data-access';
import { FleetTable, KpiHeader } from '@linkops/console-ui';
import {
  DEFAULT_FILTER,
  parseFilter,
  selectRows,
  type FleetFilter,
} from './fleet-filter';

/**
 * Fleet view container (M5). Owns no transport logic — it consumes the signal
 * {@link FleetStore} (REST snapshot + coalesced SSE), maps the live rows to the
 * presentational view-model through the pure {@link selectRows}, and renders
 * the KPI header, filter/sort controls, and the link table.
 *
 * Filter/sort state lives in the URL: the five query params are bound to inputs
 * (router component-input binding), so a view is shareable and survives reload;
 * changing a control navigates (merge) to update the URL, which flows back
 * through the inputs. Filtering/sorting is derived client-side over the live
 * state, so live updates keep re-filtering without refetching.
 */
@Component({
  selector: 'app-fleet-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiHeader, FleetTable],
  host: {
    '(document:click)': 'closeDropdowns()'
  },
  template: `
    <header class="bar">
      <div class="title">
        <h1>Fleet</h1>
        <p class="sub">Live operator console — point-to-point radio links</p>
      </div>
      <span class="conn" [attr.data-state]="store.connection()">
        <span class="pip" aria-hidden="true"></span>{{ store.connection() }}
      </span>
    </header>

    <lo-kpi-header [summary]="store.summary()" />

    <div class="filters">
      <label class="field search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 104.47 10.03l4.75 4.75 1.41-1.41-4.75-4.75A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"/></svg>
        <input
          type="search"
          placeholder="Search name or site…"
          [value]="filter().q"
          (input)="set('q', asValue($event))"
          aria-label="Search links"
        />
      </label>

      <!-- Status dropdown -->
      <div class="custom-select" [class.open]="activeDropdown() === 'status'">
        <button type="button" class="field select-btn" (click)="toggleDropdown('status', $event)" aria-label="Filter status">
          <span>{{ statusLabel() }}</span>
          <span class="chevron"></span>
        </button>
        <div class="options-menu">
          <button type="button" class="option-item" [class.selected]="filter().status === 'all'" (click)="selectOption('status', 'all')">All statuses</button>
          <button type="button" class="option-item" [class.selected]="filter().status === 'up'" (click)="selectOption('status', 'up')">Up</button>
          <button type="button" class="option-item" [class.selected]="filter().status === 'degraded'" (click)="selectOption('status', 'degraded')">Degraded</button>
          <button type="button" class="option-item" [class.selected]="filter().status === 'down'" (click)="selectOption('status', 'down')">Down</button>
        </div>
      </div>

      <!-- Band dropdown -->
      <div class="custom-select" [class.open]="activeDropdown() === 'band'">
        <button type="button" class="field select-btn" (click)="toggleDropdown('band', $event)" aria-label="Filter band">
          <span>{{ bandLabel() }}</span>
          <span class="chevron"></span>
        </button>
        <div class="options-menu">
          <button type="button" class="option-item" [class.selected]="filter().band === 'all'" (click)="selectOption('band', 'all')">All bands</button>
          <button type="button" class="option-item" [class.selected]="filter().band === '5GHz'" (click)="selectOption('band', '5GHz')">5GHz</button>
          <button type="button" class="option-item" [class.selected]="filter().band === '5.8GHz'" (click)="selectOption('band', '5.8GHz')">5.8GHz</button>
          <button type="button" class="option-item" [class.selected]="filter().band === '11GHz'" (click)="selectOption('band', '11GHz')">11GHz</button>
          <button type="button" class="option-item" [class.selected]="filter().band === '24GHz'" (click)="selectOption('band', '24GHz')">24GHz</button>
        </div>
      </div>

      <!-- Sort dropdown -->
      <div class="custom-select" [class.open]="activeDropdown() === 'sort'">
        <button type="button" class="field select-btn" (click)="toggleDropdown('sort', $event)" aria-label="Sort by">
          <span>{{ sortLabel() }}</span>
          <span class="chevron"></span>
        </button>
        <div class="options-menu">
          <button type="button" class="option-item" [class.selected]="filter().sort === 'name'" (click)="selectOption('sort', 'name')">Sort: Name</button>
          <button type="button" class="option-item" [class.selected]="filter().sort === 'status'" (click)="selectOption('sort', 'status')">Sort: Status</button>
          <button type="button" class="option-item" [class.selected]="filter().sort === 'throughput'" (click)="selectOption('sort', 'throughput')">Sort: Throughput</button>
          <button type="button" class="option-item" [class.selected]="filter().sort === 'capacity'" (click)="selectOption('sort', 'capacity')">Sort: Capacity</button>
        </div>
      </div>

      <!-- Order dropdown -->
      <div class="custom-select" [class.open]="activeDropdown() === 'order'">
        <button type="button" class="field select-btn narrow" (click)="toggleDropdown('order', $event)" aria-label="Sort order">
          <span>{{ orderLabel() }}</span>
          <span class="chevron"></span>
        </button>
        <div class="options-menu">
          <button type="button" class="option-item" [class.selected]="filter().order === 'asc'" (click)="selectOption('order', 'asc')">Asc</button>
          <button type="button" class="option-item" [class.selected]="filter().order === 'desc'" (click)="selectOption('order', 'desc')">Desc</button>
        </div>
      </div>
    </div>

    @if (view() === 'ready') {
      <div class="toolbar">
        <span class="count">
          Showing <b>{{ rows().length }}</b> of {{ totalCount() }} links
        </span>
        @if (hasActiveFilters()) {
          <button type="button" class="clear" (click)="clear()">Clear filters</button>
        }
      </div>
    }

    @switch (view()) {
      @case ('loading') {
        <div class="skeleton-list" aria-busy="true">
          <span class="sr">Loading fleet…</span>
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="skeleton-row"></div>
          }
        </div>
      }
      @case ('error') {
        <div class="msg error" role="alert">
          <strong>Could not load the fleet.</strong>
          <span>{{ store.error() }}</span>
        </div>
      }
      @case ('empty') {
        <div class="msg empty-state">
          <span class="glyph" aria-hidden="true">◎</span>
          <strong>No links in the fleet.</strong>
          <span>Seeded links appear here once the API is running.</span>
        </div>
      }
      @default {
        <lo-fleet-table [rows]="rows()" />
      }
    }

    <footer class="foot">
      LinkOps Console · live telemetry over SSE · data in-memory
    </footer>
  `,
  styles: `
    :host { display: block; padding: 1rem 1.5rem 2.5rem; max-width: 76rem; margin: 0 auto; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; }
    h1 {
      margin: 0; font-size: 1.7rem; font-weight: 800; letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--accent) 80%, var(--brand)));
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .sub { margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--muted); }
    .conn {
      display: inline-flex; align-items: center; gap: 0.4rem;
      font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--muted);
      padding: 0.3rem 0.65rem; border-radius: 99px;
      border: 1px solid var(--border); background: var(--panel);
      box-shadow: var(--shadow);
      transition: all 0.25s ease;
    }
    .conn:hover {
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }
    .pip { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--faint); transition: background 0.3s ease; }
    .conn[data-state='open'] {
      color: var(--up);
      border-color: color-mix(in srgb, var(--up) 30%, transparent);
      background: color-mix(in srgb, var(--up) 6%, var(--panel));
      box-shadow: 0 0 15px -3px color-mix(in srgb, var(--up) 15%, transparent), var(--shadow);
    }
    .conn[data-state='open'] .pip {
      background: var(--up);
      animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .conn[data-state='reconnecting'] {
      color: var(--degraded);
      border-color: color-mix(in srgb, var(--degraded) 30%, transparent);
      background: color-mix(in srgb, var(--degraded) 6%, var(--panel));
      box-shadow: 0 0 15px -3px color-mix(in srgb, var(--degraded) 15%, transparent), var(--shadow);
    }
    .conn[data-state='reconnecting'] .pip {
      background: var(--degraded);
      animation: ping-degraded 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    @keyframes ping {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--up) 60%, transparent); }
      70%, 100% { box-shadow: 0 0 0 8px transparent; }
    }
    @keyframes ping-degraded {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--degraded) 60%, transparent); }
      70%, 100% { box-shadow: 0 0 0 8px transparent; }
    }

    .filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 1.15rem 0 1.25rem; }

    .field {
      display: flex; align-items: center; gap: 0.5rem;
      background: var(--panel); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 0 0.8rem; height: 2.35rem;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.01);
    }
    .field:hover {
      border-color: var(--border-strong);
      background: var(--panel-2);
    }
    .field:focus-within {
      background: var(--panel);
      border-color: var(--accent);
      box-shadow: var(--glow-accent), 0 0 0 1px var(--accent);
      transform: translateY(-1px);
    }
    .field svg { width: 0.95rem; height: 0.95rem; fill: var(--muted); flex: none; transition: fill 0.2s ease; }
    .field:focus-within svg { fill: var(--accent); }
    .field input, .field select {
      background: transparent; color: inherit; border: none; outline: none;
      font: inherit; font-size: 0.85rem; height: 100%;
    }
    .search { min-width: 15rem; flex: 1 1 15rem; }
    .search input { width: 100%; }
    .custom-select {
      position: relative;
    }
    .select-btn {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      min-width: 8rem;
      width: 100%;
      text-align: left;
    }
    .select-btn.narrow {
      min-width: 5.25rem;
    }
    .select-btn span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chevron {
      display: inline-block;
      width: 0.38rem;
      height: 0.38rem;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      transform: translateY(-25%) rotate(45deg);
      transition: transform 0.2s ease, border-color 0.2s ease;
      flex-shrink: 0;
      margin-left: 0.25rem;
    }
    .custom-select.open .chevron {
      transform: translateY(25%) rotate(-135deg);
      border-color: var(--accent);
    }
    .options-menu {
      position: absolute;
      top: calc(100% + 0.35rem);
      left: 0;
      min-width: 100%;
      background: color-mix(in srgb, var(--panel) 94%, transparent);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow);
      padding: 0.35rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      z-index: 50;
      opacity: 0;
      transform: translateY(6px);
      pointer-events: none;
      transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .custom-select.open .options-menu {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .option-item {
      font: inherit;
      font-size: 0.85rem;
      text-align: left;
      padding: 0.55rem 0.85rem;
      border: none;
      background: transparent;
      color: var(--text);
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease, color 0.15s ease;
      width: 100%;
    }
    .option-item:hover {
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      color: var(--text);
    }
    .option-item.selected {
      font-weight: 700;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--text);
    }

    .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; min-height: 1.8rem; }
    .count { font-size: 0.85rem; color: var(--muted); }
    .count b { color: var(--text); font-variant-numeric: tabular-nums; }
    .clear {
      font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer;
      color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); border: none; padding: 0.3rem 0.7rem; border-radius: 8px;
      transition: all 0.2s ease;
    }
    .clear:hover { background: color-mix(in srgb, var(--accent) 15%, transparent); transform: translateY(-1px); }
    .clear:active { transform: translateY(0); }

    .msg {
      display: flex; flex-direction: column; gap: 0.5rem; align-items: center;
      text-align: center; color: var(--muted); padding: 3.5rem 1.5rem; font-size: 0.95rem;
      border: 1px dashed var(--border-strong); border-radius: var(--radius);
      background: var(--panel-2);
      box-shadow: var(--shadow);
      transition: border-color 0.3s ease;
    }
    .msg strong { color: var(--text); font-size: 1.1rem; font-weight: 700; }
    .msg.error { border-color: color-mix(in srgb, var(--down) 30%, transparent); background: color-mix(in srgb, var(--down) 2%, var(--panel-2)); }
    .msg.error strong { color: var(--down); }
    .empty-state .glyph { font-size: 2.5rem; color: var(--accent); margin-bottom: 0.25rem; animation: pulse-glyph 2s infinite ease-in-out; }
    @keyframes pulse-glyph { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.1); opacity: 1; } }

    .skeleton-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .skeleton-row {
      height: 3.2rem; border-radius: var(--radius-sm);
      background: linear-gradient(90deg, var(--panel) 25%, var(--panel-2) 50%, var(--panel) 75%);
      background-size: 200% 100%; border: 1px solid var(--border);
      animation: shimmer 1.6s infinite linear;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

    .foot { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--faint); text-align: center; letter-spacing: 0.02em; }
  `,
})
export class FleetView {
  protected readonly store = inject(FleetStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Active custom dropdown tracking
  protected readonly activeDropdown = signal<'status' | 'band' | 'sort' | 'order' | null>(null);

  // Computed labels for selected filters
  protected readonly statusLabel = computed(() => {
    switch (this.filter().status) {
      case 'up': return 'Up';
      case 'degraded': return 'Degraded';
      case 'down': return 'Down';
      default: return 'All statuses';
    }
  });

  protected readonly bandLabel = computed(() => {
    switch (this.filter().band) {
      case '5GHz': return '5GHz';
      case '5.8GHz': return '5.8GHz';
      case '11GHz': return '11GHz';
      case '24GHz': return '24GHz';
      default: return 'All bands';
    }
  });

  protected readonly sortLabel = computed(() => {
    switch (this.filter().sort) {
      case 'status': return 'Sort: Status';
      case 'throughput': return 'Sort: Throughput';
      case 'capacity': return 'Sort: Capacity';
      default: return 'Sort: Name';
    }
  });

  protected readonly orderLabel = computed(() => {
    return this.filter().order === 'desc' ? 'Desc' : 'Asc';
  });

  protected toggleDropdown(type: 'status' | 'band' | 'sort' | 'order', event: Event): void {
    event.stopPropagation();
    this.activeDropdown.update((current) => (current === type ? null : type));
  }

  protected selectOption(key: keyof FleetFilter, value: string): void {
    this.set(key, value);
    this.activeDropdown.set(null);
  }

  protected closeDropdowns(): void {
    this.activeDropdown.set(null);
  }

  // URL query params, bound via router component-input binding.
  readonly status = input<string>();
  readonly band = input<string>();
  readonly q = input<string>();
  readonly sort = input<string>();
  readonly order = input<string>();

  protected readonly filter = computed<FleetFilter>(() =>
    parseFilter({
      status: this.status(),
      band: this.band(),
      q: this.q(),
      sort: this.sort(),
      order: this.order(),
    }),
  );

  protected readonly rows = computed(() =>
    selectRows(this.store.rows(), this.filter()),
  );

  protected readonly totalCount = computed(() => this.store.rows().length);

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filter();
    return (
      f.status !== DEFAULT_FILTER.status ||
      f.band !== DEFAULT_FILTER.band ||
      f.q !== DEFAULT_FILTER.q ||
      f.sort !== DEFAULT_FILTER.sort ||
      f.order !== DEFAULT_FILTER.order
    );
  });

  protected readonly view = computed<'loading' | 'error' | 'empty' | 'ready'>(
    () => {
      const status = this.store.status();
      if (status === 'loading' || status === 'idle') {
        return 'loading';
      }
      if (status === 'error') {
        return 'error';
      }
      return this.store.isEmpty() ? 'empty' : 'ready';
    },
  );

  constructor() {
    this.store.load();
    this.store.connect();
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** Push a filter change into the URL; defaults are cleared to keep it tidy. */
  protected set(key: keyof FleetFilter, value: string): void {
    const isDefault = value === DEFAULT_FILTER[key] || value === '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: isDefault ? null : value },
      queryParamsHandling: 'merge',
    });
  }

  /** Reset all filter/sort state — clears every query param. */
  protected clear(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
}
