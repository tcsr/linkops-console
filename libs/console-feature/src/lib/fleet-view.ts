import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
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
  template: `
    <header class="bar">
      <h1>Fleet</h1>
      <span class="conn" [attr.data-state]="store.connection()">{{ store.connection() }}</span>
    </header>

    <lo-kpi-header [summary]="store.summary()" />

    <div class="filters">
      <input
        type="search"
        placeholder="Search name / site"
        [value]="filter().q"
        (input)="set('q', asValue($event))"
        aria-label="Search links"
      />
      <select [value]="filter().status" (change)="set('status', asValue($event))" aria-label="Filter status">
        <option value="all">All statuses</option>
        <option value="up">Up</option>
        <option value="degraded">Degraded</option>
        <option value="down">Down</option>
      </select>
      <select [value]="filter().band" (change)="set('band', asValue($event))" aria-label="Filter band">
        <option value="all">All bands</option>
        <option value="5GHz">5GHz</option>
        <option value="5.8GHz">5.8GHz</option>
        <option value="11GHz">11GHz</option>
        <option value="24GHz">24GHz</option>
      </select>
      <select [value]="filter().sort" (change)="set('sort', asValue($event))" aria-label="Sort by">
        <option value="name">Name</option>
        <option value="status">Status</option>
        <option value="throughput">Throughput</option>
        <option value="capacity">Capacity</option>
      </select>
      <select [value]="filter().order" (change)="set('order', asValue($event))" aria-label="Sort order">
        <option value="asc">Asc</option>
        <option value="desc">Desc</option>
      </select>
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
    :host { display: block; padding: 1.5rem; max-width: 70rem; margin: 0 auto; }
    .bar { display: flex; align-items: baseline; gap: 1rem; }
    .conn { font-size: 0.75rem; color: var(--muted, #8b98a5); text-transform: uppercase; }
    .conn[data-state='open'] { color: var(--up, #2ea043); }
    .conn[data-state='reconnecting'] { color: var(--degraded, #d29922); }
    .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1rem 0; }
    .filters input, .filters select {
      background: var(--panel, #1a2129); color: inherit;
      border: 1px solid #2a333d; border-radius: 0.375rem; padding: 0.35rem 0.5rem;
    }
    .msg { color: var(--muted, #8b98a5); padding: 1.5rem 0; }
    .msg.error { color: var(--down, #f85149); }
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
