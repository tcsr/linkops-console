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
        <div class="tile wide"><span class="v">{{ s.avgThroughputMbps }}<small>Mbps</small></span><span class="k">Avg Throughput</span></div>
      </div>
    } @else {
      <div class="kpis empty" aria-busy="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="tile skeleton"></div>
        }
        <span class="sr">Loading fleet summary…</span>
      </div>
    }
  `,
  styles: `
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr)) 1.4fr;
      gap: 0.75rem;
    }
    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.85rem 1rem;
      border-radius: var(--radius-sm, 10px);
      background: linear-gradient(180deg, var(--panel-2, #18212f), var(--panel, #131a25));
      border: 1px solid var(--border, #212b3a);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .tile::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--faint, #586478);
    }
    .tile.up::before { background: var(--up, #34d399); }
    .tile.degraded::before { background: var(--degraded, #fbbf24); }
    .tile.down::before { background: var(--down, #f87171); }
    .tile.wide::before { background: var(--accent, #6ea8fe); }
    .v {
      font-size: 1.7rem;
      font-weight: 720;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .v small { font-size: 0.7rem; font-weight: 600; color: var(--muted, #8b98ab); margin-left: 0.3rem; }
    .k { font-size: 0.68rem; font-weight: 600; color: var(--muted, #8b98ab); text-transform: uppercase; letter-spacing: 0.06em; }
    .up .v { color: var(--up, #34d399); }
    .degraded .v { color: var(--degraded, #fbbf24); }
    .down .v { color: var(--down, #f87171); }
    .skeleton { height: 4.1rem; opacity: 0.5; animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.6; } }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 640px) { .kpis { grid-template-columns: repeat(2, 1fr); } .tile.wide { grid-column: span 2; } }
  `,
})
export class KpiHeader {
  readonly summary = input<FleetSummary | null>(null);
}
