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
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      width: 100%;
    }
    .tile.wide, .tile:nth-child(5) {
      grid-column: span 2;
    }
    
    @media (min-width: 768px) {
      .kpis {
        grid-template-columns: repeat(4, minmax(0, 1fr)) 1.4fr;
        gap: 0.85rem;
        margin-bottom: 2rem;
      }
      .tile.wide, .tile:nth-child(5) {
        grid-column: auto;
      }
    }
    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.85rem 1.1rem 0.85rem 1.45rem;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--panel) 75%, transparent);
      backdrop-filter: blur(12px);
      border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
      box-shadow: var(--shadow);
      overflow: hidden;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), 
                  box-shadow 0.25s ease, 
                  border-color 0.25s ease,
                  background 0.25s ease;
      animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    
    @keyframes slide-in {
      0% { transform: translateY(12px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    
    .tile:nth-child(1) { animation-delay: 0.05s; }
    .tile:nth-child(2) { animation-delay: 0.1s; }
    .tile:nth-child(3) { animation-delay: 0.15s; }
    .tile:nth-child(4) { animation-delay: 0.2s; }
    .tile:nth-child(5) { animation-delay: 0.25s; }

    /* Fine crosshair micro-pattern background */
    .tile::after {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0.035;
      pointer-events: none;
      background-size: 8px 8px;
      background-image: radial-gradient(var(--text) 1px, transparent 1px);
      z-index: 1;
    }

    .tile::before {
      content: '';
      position: absolute;
      left: 10px;
      top: 22%;
      height: 56%;
      width: 3px;
      background: var(--faint);
      border-radius: 99px;
      z-index: 2;
    }
    
    /* Specific glassmorphic background glows and borders */
    .tile {
      background: radial-gradient(circle at 80% 20%, rgba(148, 163, 184, 0.02) 0%, transparent 60%), color-mix(in srgb, var(--panel) 75%, transparent);
    }
    .tile.up { 
      border-color: color-mix(in srgb, var(--up) 22%, transparent);
      background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--up) 6%, transparent) 0%, transparent 70%), color-mix(in srgb, var(--panel) 75%, transparent); 
    }
    .tile.degraded { 
      border-color: color-mix(in srgb, var(--degraded) 22%, transparent);
      background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--degraded) 6%, transparent) 0%, transparent 70%), color-mix(in srgb, var(--panel) 75%, transparent); 
    }
    .tile.down { 
      border-color: color-mix(in srgb, var(--down) 22%, transparent);
      background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--down) 6%, transparent) 0%, transparent 70%), color-mix(in srgb, var(--panel) 75%, transparent); 
    }
    .tile.wide { 
      border-color: color-mix(in srgb, var(--accent) 22%, transparent);
      background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 70%), color-mix(in srgb, var(--panel) 75%, transparent); 
    }

    .tile.up::before { background: var(--up); }
    .tile.degraded::before { background: var(--degraded); }
    .tile.down::before { background: var(--down); }
    .tile.wide::before { background: var(--accent); }

    /* Hover effects with colored glows and lift */
    .tile:hover {
      transform: translateY(-2px) scale(1.005);
    }
    .tile:hover::after {
      opacity: 0.055;
    }
    .tile:not(.up):not(.degraded):not(.down):not(.wide):hover {
      box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.12), var(--shadow);
      border-color: var(--border-strong);
    }
    .tile.up:hover {
      box-shadow: var(--glow-up), var(--shadow);
      border-color: color-mix(in srgb, var(--up) 60%, transparent);
    }
    .tile.degraded:hover {
      box-shadow: var(--glow-degraded), var(--shadow);
      border-color: color-mix(in srgb, var(--degraded) 60%, transparent);
    }
    .tile.down:hover {
      box-shadow: var(--glow-down), var(--shadow);
      border-color: color-mix(in srgb, var(--down) 60%, transparent);
    }
    .tile.wide:hover {
      box-shadow: var(--glow-accent), var(--shadow);
      border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    }

    .v {
      display: inline-block;
      font-size: 1.6rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      z-index: 2;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .tile:hover .v {
      transform: scale(1.03) translateX(1px);
    }
    .v small { font-size: 0.7rem; font-weight: 700; color: var(--muted); margin-left: 0.3rem; }
    .k { font-size: 0.6rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; z-index: 2; }
    .v { color: var(--text); }
    .up .v { color: var(--up); }
    .degraded .v { color: var(--degraded); }
    .down .v { color: var(--down); }
    .wide .v { color: var(--accent); }
    
    .skeleton { 
      height: 4.15rem; 
      opacity: 0.6; 
      background: linear-gradient(90deg, var(--panel) 25%, var(--panel-2) 50%, var(--panel) 75%);
      background-size: 200% 100%;
      border: 1px solid var(--border);
      animation: shimmer-skeleton 1.6s infinite linear; 
    }
    @keyframes shimmer-skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 640px) { .kpis { grid-template-columns: repeat(2, 1fr); } .tile.wide { grid-column: span 2; } }
  `,
})
export class KpiHeader {
  readonly summary = input<FleetSummary | null>(null);
}
