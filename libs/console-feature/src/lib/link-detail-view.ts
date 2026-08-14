import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkDetailStore } from '@linkops/console-data-access';
import { StatusBadge, Sparkline } from '@linkops/console-ui';

/**
 * Link detail container (M6). Route `/links/:id`; the `id` input is bound from
 * the route param (router component-input binding), so a deep link or a browser
 * refresh loads the same view. Owns no transport — it drives the signal
 * {@link LinkDetailStore} (REST snapshot + telemetry history + live folding off
 * the shared SSE stream) and renders through presentational `console-ui`.
 */
@Component({
  selector: 'app-link-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatusBadge, Sparkline],
  template: `
    <a class="back" routerLink="/">← Fleet</a>

    @switch (store.state()) {
      @case ('loading') {
        <div class="skeleton" aria-busy="true">
          <span class="sr">Loading link…</span>
          <div class="sk-head"></div>
          <div class="sk-chart"></div>
        </div>
      }
      @case ('not-found') {
        <div class="msg empty-state">
          <span class="glyph" aria-hidden="true">◎</span>
          <strong>Link not found.</strong>
          <span>This link may have been removed. Return to the fleet.</span>
          <a class="cta" routerLink="/">Back to fleet</a>
        </div>
      }
      @case ('error') {
        <div class="msg error" role="alert">
          <strong>Could not load this link.</strong>
          <span>{{ store.error() }}</span>
        </div>
      }
      @default {
        @if (link(); as l) {
          <header class="head">
            <div class="id">
              <h1>{{ l.name }}</h1>
              <p class="sites">{{ l.siteA }} <span class="arr">↔</span> {{ l.siteB }}</p>
            </div>
            <div class="head-right">
              @if (store.status(); as s) {
                <lo-status-badge [status]="s" />
              }
              <a class="edit" [routerLink]="['/links', l.id, 'edit']">Edit</a>
            </div>
          </header>

          <section class="attrs" aria-label="Link configuration">
            <div class="attr"><span class="k">Band</span><span class="v">{{ l.band }}</span></div>
            <div class="attr"><span class="k">Mode</span><span class="v">{{ l.mode }}</span></div>
            <div class="attr"><span class="k">Channel</span><span class="v">{{ l.channelWidthMhz }} MHz</span></div>
            <div class="attr"><span class="k">Capacity</span><span class="v">{{ l.capacityMbps }} Mbps</span></div>
            <div class="attr"><span class="k">Tx Power</span><span class="v">{{ l.txPowerDbm }} dBm</span></div>
            <div class="attr"><span class="k">Version</span><span class="v">v{{ l.version }}</span></div>
          </section>

          <section class="telemetry" aria-label="Live telemetry">
            <div class="tel-head">
              <h2>Live telemetry</h2>
              <span class="conn" [attr.data-state]="connection()">
                <span class="pip" aria-hidden="true"></span>{{ connection() }}
              </span>
            </div>

            <div class="chart">
              <lo-sparkline
                [values]="throughputSeries()"
                [max]="l.capacityMbps"
                label="throughput"
              />
              <div class="scale">
                <span>{{ l.capacityMbps }}</span>
                <span>0</span>
              </div>
            </div>

            @if (sample(); as sm) {
              <div class="metrics">
                <div class="metric">
                  <span class="mk">Throughput</span>
                  <span class="mv">{{ sm.throughputMbps }} <small>Mbps</small></span>
                </div>
                <div class="metric">
                  <span class="mk">RSSI</span>
                  <span class="mv">{{ sm.rssiDbm }} <small>dBm</small></span>
                </div>
                <div class="metric">
                  <span class="mk">SNR</span>
                  <span class="mv">{{ sm.snrDb }} <small>dB</small></span>
                </div>
              </div>
            } @else {
              <p class="no-sample">Waiting for the first telemetry sample…</p>
            }
          </section>
        }
      }
    }
  `,
  styles: `
    :host { display: block; padding: 1rem 1.5rem 2.5rem; max-width: 60rem; margin: 0 auto; }
    .back {
      display: inline-block; font-size: 0.82rem; font-weight: 700; color: var(--muted);
      text-decoration: none; margin-bottom: 1rem; transition: color 0.2s ease;
    }
    .back:hover { color: var(--accent); }

    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
    h1 {
      margin: 0; font-size: 1.55rem; font-weight: 800; letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--accent) 80%, var(--brand)));
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .sites { margin: 0.2rem 0 0; font-size: 0.9rem; color: var(--muted); }
    .arr { color: var(--faint); padding: 0 0.2rem; }
    .head-right { display: inline-flex; align-items: center; gap: 0.75rem; flex: none; }
    .edit {
      font-size: 0.8rem; font-weight: 700; text-decoration: none; color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      padding: 0.4rem 0.85rem; border-radius: var(--radius-sm);
      border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
      transition: all 0.2s ease;
    }
    .edit:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); transform: translateY(-1px); }
    .edit:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .attrs {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.75rem;
      background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 1rem 1.25rem; box-shadow: var(--shadow); margin-bottom: 1.5rem;
    }
    .attr { display: flex; flex-direction: column; gap: 0.2rem; }
    .attr .k { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
    .attr .v { font-size: 0.95rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

    .telemetry {
      background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 1.25rem; box-shadow: var(--shadow);
    }
    .tel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    h2 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--text); }
    .conn {
      display: inline-flex; align-items: center; gap: 0.4rem;
      font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--muted); padding: 0.25rem 0.6rem; border-radius: 99px;
      border: 1px solid var(--border); background: var(--panel-2);
    }
    .pip { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--faint); }
    .conn[data-state='open'] { color: var(--up); border-color: color-mix(in srgb, var(--up) 30%, transparent); }
    .conn[data-state='open'] .pip { background: var(--up); }
    .conn[data-state='reconnecting'] { color: var(--degraded); }
    .conn[data-state='reconnecting'] .pip { background: var(--degraded); }

    .chart { display: flex; gap: 0.75rem; align-items: stretch; height: 5rem; margin-bottom: 1.15rem; }
    .chart lo-sparkline { flex: 1; }
    .scale { display: flex; flex-direction: column; justify-content: space-between; font-size: 0.66rem; color: var(--faint); font-variant-numeric: tabular-nums; padding: 0.15rem 0; }

    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
    .metric {
      display: flex; flex-direction: column; gap: 0.25rem;
      background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 0.75rem 0.9rem;
    }
    .metric .mk { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
    .metric .mv { font-size: 1.2rem; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
    .metric .mv small { font-size: 0.7rem; font-weight: 600; color: var(--muted); }
    .no-sample { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0 0; }

    .msg {
      display: flex; flex-direction: column; gap: 0.5rem; align-items: center; text-align: center;
      color: var(--muted); padding: 3.5rem 1.5rem; font-size: 0.95rem;
      border: 1px dashed var(--border-strong); border-radius: var(--radius); background: var(--panel-2); box-shadow: var(--shadow);
    }
    .msg strong { color: var(--text); font-size: 1.1rem; font-weight: 700; }
    .msg.error { border-color: color-mix(in srgb, var(--down) 30%, transparent); }
    .msg.error strong { color: var(--down); }
    .empty-state .glyph { font-size: 2.5rem; color: var(--accent); }
    .cta {
      margin-top: 0.5rem; font-size: 0.82rem; font-weight: 700; text-decoration: none; color: var(--accent);
      padding: 0.45rem 0.9rem; border-radius: var(--radius-sm); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    }
    .cta:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }

    .skeleton { display: flex; flex-direction: column; gap: 1rem; }
    .sk-head, .sk-chart {
      border-radius: var(--radius); border: 1px solid var(--border);
      background: linear-gradient(90deg, var(--panel) 25%, var(--panel-2) 50%, var(--panel) 75%);
      background-size: 200% 100%; animation: shimmer 1.6s infinite linear;
    }
    .sk-head { height: 4rem; }
    .sk-chart { height: 9rem; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
})
export class LinkDetailView {
  protected readonly store = inject(LinkDetailStore);

  /** Route param `:id`, bound via router component-input binding. */
  readonly id = input.required<string>();

  protected readonly link = this.store.link;
  protected readonly sample = this.store.latestSample;
  protected readonly connection = this.store.connection;

  /** Throughput values for the sparkline (oldest → newest). */
  protected readonly throughputSeries = computed<number[]>(() =>
    this.store.series().map((s) => s.throughputMbps),
  );

  private lastLoaded: string | null = null;

  constructor() {
    // Re-load whenever the route id changes (also covers the first render and a
    // browser refresh on the detail route). Guarded so a single id loads once
    // even if the effect is flushed more than once.
    effect(() => {
      const id = this.id();
      if (id && id !== this.lastLoaded) {
        this.lastLoaded = id;
        this.store.load(id);
      }
    });
  }
}
