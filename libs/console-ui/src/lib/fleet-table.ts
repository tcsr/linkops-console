import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { StatusBadge } from './status-badge';
import type { FleetRow } from './fleet-row';

/**
 * Presentational fleet list. Rows are tracked by `id` so a live update mutates
 * only the changed row rather than recreating the collection. Selecting a row's
 * name emits `rowSelect` with the link id; the container decides where to
 * navigate, keeping this component router-agnostic.
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
              <td class="name">
                <button type="button" class="name-btn" (click)="rowSelect.emit(row.id)">
                  {{ row.name }}
                </button>
              </td>
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
      border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      border-radius: var(--radius);
      background: var(--panel);
      box-shadow: var(--shadow);
      overflow: visible;
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.92rem; }
    thead th {
      position: sticky; top: 3.75rem;
      background: var(--panel-2);
      font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--muted);
      text-align: left; padding: 0.9rem 1.25rem; white-space: nowrap;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      z-index: 10;
    }
    thead th:first-child { border-top-left-radius: var(--radius); }
    thead th:last-child { border-top-right-radius: var(--radius); }
    /* keep numeric headers aligned with their columns (out-specifies thead th) */
    thead th.num { text-align: right; }
    tbody td { 
      padding: 0.9rem 1.25rem; 
      border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent); 
      transition: box-shadow 0.2s ease;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:last-child td:first-child { border-bottom-left-radius: var(--radius); }
    tbody tr:last-child td:last-child { border-bottom-right-radius: var(--radius); }
    tbody tr { transition: background 0.2s ease; }
    tbody tr:hover { background: color-mix(in srgb, var(--accent) 4%, var(--panel-2)); }
    tbody tr:hover td:first-child { box-shadow: inset 4px 0 0 0 var(--accent); }
    .name { font-weight: 700; color: var(--text); }
    .name-btn {
      font: inherit; font-weight: 700; color: var(--text);
      background: none; border: none; padding: 0; cursor: pointer;
      text-align: left; border-radius: 4px;
      transition: color 0.2s ease;
    }
    .name-btn:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
    .name-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .sites { color: var(--muted); font-size: 0.88rem; }
    .arr { color: var(--faint); padding: 0 0.2rem; }
    .band {
      display: inline-block; min-width: 3.4rem; text-align: center;
      font-size: 0.72rem; font-weight: 700; color: var(--muted);
      padding: 0.2rem 0.55rem; border-radius: 99px;
      background: color-mix(in srgb, var(--border-strong) 25%, transparent);
      border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      transition: all 0.2s ease;
    }
    tr:hover .band {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      color: var(--text);
    }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    /* throughput: fixed-width bar + right-aligned number so the column lines up */
    .tput .meter { display: inline-flex; align-items: center; gap: 0.8rem; }
    .track { 
      width: 68px; height: 6px; border-radius: 999px; 
      background: color-mix(in srgb, var(--border-strong) 35%, transparent); 
      overflow: hidden; flex: none; 
    }
    .fill { 
      height: 100%; border-radius: 999px; 
      transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); 
    }
    .fill.up { 
      background: linear-gradient(90deg, color-mix(in srgb, var(--up) 80%, white), var(--up)); 
      box-shadow: 0 0 6px var(--up);
    }
    .fill.degraded { 
      background: linear-gradient(90deg, color-mix(in srgb, var(--degraded) 80%, white), var(--degraded)); 
      box-shadow: 0 0 6px var(--degraded);
    }
    .fill.down { 
      background: linear-gradient(90deg, color-mix(in srgb, var(--down) 80%, white), var(--down)); 
      box-shadow: 0 0 6px var(--down);
    }
    .mbps { min-width: 4rem; text-align: right; font-weight: 700; color: var(--text); }
    .cap { color: var(--muted); font-weight: 600; }
    .dash { color: var(--faint); }
    .empty { text-align: center; color: var(--muted); padding: 3rem 1.25rem; font-weight: 500; }
  `,
})
export class FleetTable {
  readonly rows = input.required<readonly FleetRow[]>();
  /** Emits the id of the link whose name was activated. */
  readonly rowSelect = output<string>();

  protected pct(row: FleetRow): number {
    if (row.throughputMbps === null || row.capacityMbps <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (row.throughputMbps / row.capacityMbps) * 100));
  }
}
