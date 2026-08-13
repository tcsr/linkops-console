import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FleetSummary } from '@linkops/domain';

/** Dashboard KPI header showing the server-computed fleet summary. */
@Component({
  selector: 'lo-kpi-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = summary();
    @if (s) {
      <div class="kpis">
        <div class="tile"><span class="v">{{ s.total }}</span><span class="k">Total</span></div>
        <div class="tile up"><span class="v">{{ s.up }}</span><span class="k">Up</span></div>
        <div class="tile degraded"><span class="v">{{ s.degraded }}</span><span class="k">Degraded</span></div>
        <div class="tile down"><span class="v">{{ s.down }}</span><span class="k">Down</span></div>
        <div class="tile"><span class="v">{{ s.avgThroughputMbps }}</span><span class="k">Avg Mbps</span></div>
      </div>
    } @else {
      <div class="kpis empty" aria-busy="true">Loading fleet summary…</div>
    }
  `,
  styles: `
    .kpis { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .tile {
      display: flex; flex-direction: column; align-items: center;
      min-width: 5rem; padding: 0.6rem 0.9rem; border-radius: 0.5rem;
      background: var(--panel, #1a2129);
    }
    .v { font-size: 1.4rem; font-weight: 700; }
    .k { font-size: 0.7rem; color: var(--muted, #8b98a5); text-transform: uppercase; }
    .up .v { color: var(--up, #2ea043); }
    .degraded .v { color: var(--degraded, #d29922); }
    .down .v { color: var(--down, #f85149); }
    .empty { color: var(--muted, #8b98a5); padding: 0.6rem; }
  `,
})
export class KpiHeader {
  readonly summary = input<FleetSummary | null>(null);
}
