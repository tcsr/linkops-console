import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StatusBadge } from './status-badge';
import type { FleetRow } from './fleet-row';

/**
 * Presentational fleet list. Rows are tracked by `id` so a live update mutates
 * only the changed row rather than recreating the collection.
 */
@Component({
  selector: 'lo-fleet-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadge],
  template: `
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Sites</th><th>Band</th><th>Status</th>
          <th class="num">Mbps</th><th class="num">Capacity</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.id) {
          <tr>
            <td>{{ row.name }}</td>
            <td>{{ row.siteA }} ↔ {{ row.siteB }}</td>
            <td>{{ row.band }}</td>
            <td><lo-status-badge [status]="row.status" /></td>
            <td class="num">{{ row.throughputMbps ?? '—' }}</td>
            <td class="num">{{ row.capacityMbps }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="empty">No links match the current filters.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.45rem 0.6rem; text-align: left; border-bottom: 1px solid #2a333d; }
    th { font-size: 0.75rem; text-transform: uppercase; color: var(--muted, #8b98a5); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { text-align: center; color: var(--muted, #8b98a5); padding: 1.2rem; }
  `,
})
export class FleetTable {
  readonly rows = input.required<readonly FleetRow[]>();
}
