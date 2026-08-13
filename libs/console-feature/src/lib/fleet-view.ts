import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FleetStore } from '@linkops/console-data-access';
import { FleetTable, KpiHeader, ThemeToggle } from '@linkops/console-ui';
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
  imports: [KpiHeader, FleetTable, ThemeToggle],
  template: `
    <header class="bar">
      <div class="title">
        <p class="brand">LinkOps Console</p>
        <h1>Fleet</h1>
        <p class="sub">Live operator console — point-to-point radio links</p>
      </div>
      <div class="tools">
        <span class="conn" [attr.data-state]="store.connection()">
          <span class="pip" aria-hidden="true"></span>{{ store.connection() }}
        </span>
        <lo-theme-toggle />
      </div>
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
      <label class="field select">
        <select [value]="filter().status" (change)="set('status', asValue($event))" aria-label="Filter status">
          <option value="all">All statuses</option>
          <option value="up">Up</option>
          <option value="degraded">Degraded</option>
          <option value="down">Down</option>
        </select>
      </label>
      <label class="field select">
        <select [value]="filter().band" (change)="set('band', asValue($event))" aria-label="Filter band">
          <option value="all">All bands</option>
          <option value="5GHz">5GHz</option>
          <option value="5.8GHz">5.8GHz</option>
          <option value="11GHz">11GHz</option>
          <option value="24GHz">24GHz</option>
        </select>
      </label>
      <label class="field select">
        <select [value]="filter().sort" (change)="set('sort', asValue($event))" aria-label="Sort by">
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
          <option value="throughput">Sort: Throughput</option>
          <option value="capacity">Sort: Capacity</option>
        </select>
      </label>
      <label class="field select narrow">
        <select [value]="filter().order" (change)="set('order', asValue($event))" aria-label="Sort order">
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </label>
    </div>

    @switch (view()) {
      @case ('loading') {
        <p class="msg" aria-busy="true">Loading fleet…</p>
      }
      @case ('error') {
        <p class="msg error" role="alert">{{ store.error() }}</p>
      }
      @case ('empty') {
        <p class="msg">No links in the fleet.</p>
      }
      @default {
        <lo-fleet-table [rows]="rows()" />
      }
    }
  `,
  styles: `
    :host { display: block; padding: 2rem 1.5rem 3rem; max-width: 74rem; margin: 0 auto; }
    .bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
    .tools { display: flex; align-items: center; gap: 0.6rem; }
    .brand {
      margin: 0 0 0.15rem; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--brand, #ea4a1e);
    }
    h1 {
      margin: 0; font-size: 1.95rem; font-weight: 760; letter-spacing: -0.03em;
      background: linear-gradient(120deg, var(--text, #1b2a38), var(--accent, #1399ae));
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .sub { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--muted, #8b98ab); }
    .conn {
      display: inline-flex; align-items: center; gap: 0.45rem;
      font-size: 0.7rem; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--muted, #8b98ab);
      padding: 0.35rem 0.7rem; border-radius: 999px;
      border: 1px solid var(--border, #212b3a); background: var(--panel, #131a25);
    }
    .pip { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--faint, #586478); }
    .conn[data-state='open'] { color: var(--up, #34d399); border-color: color-mix(in srgb, var(--up, #34d399) 35%, transparent); }
    .conn[data-state='open'] .pip { background: var(--up, #34d399); box-shadow: 0 0 0 0 color-mix(in srgb, var(--up, #34d399) 60%, transparent); animation: ping 1.8s ease-out infinite; }
    .conn[data-state='reconnecting'] { color: var(--degraded, #fbbf24); border-color: color-mix(in srgb, var(--degraded, #fbbf24) 35%, transparent); }
    .conn[data-state='reconnecting'] .pip { background: var(--degraded, #fbbf24); }
    @keyframes ping { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--up, #34d399) 55%, transparent); } 70%, 100% { box-shadow: 0 0 0 6px transparent; } }

    .filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 1.25rem 0 1.5rem; }
    .field {
      display: flex; align-items: center; gap: 0.5rem;
      background: var(--panel, #131a25); border: 1px solid var(--border, #212b3a);
      border-radius: var(--radius-sm, 10px); padding: 0 0.7rem; height: 2.5rem;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .field:focus-within { border-color: var(--accent, #6ea8fe); box-shadow: 0 0 0 3px var(--accent-dim, rgba(110, 168, 254, 0.14)); }
    .field svg { width: 1rem; height: 1rem; fill: var(--muted, #8b98ab); flex: none; }
    .field input, .field select {
      background: transparent; color: inherit; border: none; outline: none;
      font: inherit; font-size: 0.88rem; height: 100%;
    }
    .search { min-width: 15rem; flex: 1 1 15rem; }
    .search input { width: 100%; }
    .select { position: relative; padding-right: 1.9rem; }
    .select::after {
      content: ''; position: absolute; right: 0.75rem; top: 50%;
      width: 0.5rem; height: 0.5rem; border-right: 2px solid var(--muted, #8b98ab);
      border-bottom: 2px solid var(--muted, #8b98ab); transform: translateY(-65%) rotate(45deg);
      pointer-events: none;
    }
    .select select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 0.3rem; }
    .select.narrow { min-width: 5.5rem; }
    .field option { background: var(--panel-2, #18212f); color: var(--text, #e8eef7); }

    .msg { color: var(--muted, #8b98ab); padding: 2rem 0.25rem; font-size: 0.95rem; }
    .msg.error { color: var(--down, #f87171); }
  `,
})
export class FleetView {
  protected readonly store = inject(FleetStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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
}
