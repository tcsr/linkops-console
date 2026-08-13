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
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Sites</th><th>Band</th><th>Status</th>
            <th class="num">Throughput</th><th class="num">Capacity</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.id) {
            <tr>
              <td class="name">{{ row.name }}</td>
              <td class="sites">{{ row.siteA }} <span class="arr">↔</span> {{ row.siteB }}</td>
              <td><span class="band">{{ row.band }}</span></td>
              <td><lo-status-badge [status]="row.status" /></td>
              <td class="num tput">
                @if (row.throughputMbps !== null) {
                  <div class="meter">
                    <div class="track">
                      <div
                        class="fill"
                        [class.up]="row.status === 'up'"
                        [class.degraded]="row.status === 'degraded'"
                        [class.down]="row.status === 'down'"
                        [style.width.%]="pct(row)"
                      ></div>
                    </div>
                    <span class="mbps">{{ row.throughputMbps }}</span>
                  </div>
                } @else {
                  <span class="dash">—</span>
                }
              </td>
              <td class="num cap">{{ row.capacityMbps }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">No links match the current filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .card {
      border: 1px solid var(--border, #212b3a);
      border-radius: var(--radius, 16px);
      background: var(--panel, #131a25);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    thead th {
      position: sticky; top: 0;
      background: color-mix(in srgb, var(--panel-2, #18212f) 92%, transparent);
      backdrop-filter: blur(6px);
      font-size: 0.68rem; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--muted, #8b98ab);
      text-align: left; padding: 0.7rem 1rem;
      border-bottom: 1px solid var(--border, #212b3a);
    }
    tbody td { padding: 0.7rem 1rem; border-bottom: 1px solid color-mix(in srgb, var(--border, #212b3a) 55%, transparent); }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr { transition: background 0.12s ease; }
    tbody tr:hover { background: color-mix(in srgb, var(--accent, #6ea8fe) 6%, transparent); }
    .name { font-weight: 600; }
    .sites { color: var(--muted, #8b98ab); }
    .arr { color: var(--faint, #586478); }
    .band {
      font-size: 0.75rem; font-weight: 600; color: var(--muted, #8b98ab);
      padding: 0.12rem 0.45rem; border-radius: 6px;
      background: color-mix(in srgb, var(--border-strong, #2c3849) 45%, transparent);
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .tput .meter { display: flex; align-items: center; gap: 0.55rem; justify-content: flex-end; }
    .track { width: 72px; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--border-strong, #2c3849) 60%, transparent); overflow: hidden; }
    .fill { height: 100%; border-radius: 999px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
    .fill.up { background: var(--up, #34d399); }
    .fill.degraded { background: var(--degraded, #fbbf24); }
    .fill.down { background: var(--down, #f87171); }
    .mbps { min-width: 3.6rem; font-weight: 600; }
    .cap { color: var(--muted, #8b98ab); }
    .dash { color: var(--faint, #586478); }
    .empty { text-align: center; color: var(--muted, #8b98ab); padding: 2.5rem 1rem; }
  `,
})
export class FleetTable {
  readonly rows = input.required<readonly FleetRow[]>();

  protected pct(row: FleetRow): number {
    if (row.throughputMbps === null || row.capacityMbps <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (row.throughputMbps / row.capacityMbps) * 100));
  }
}
