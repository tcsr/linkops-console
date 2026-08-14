import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Hand-rolled SVG sparkline (no chart library, per the assignment). Purely
 * presentational: it takes a numeric series and an upper bound and draws a
 * filled trend line with a marker on the most recent point. The series is
 * expected to arrive already coalesced (one update per animation frame), so the
 * component re-renders at most once per tick — no per-sample redraw storm.
 */
@Component({
  selector: 'lo-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="spark"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      @if (points().length >= 2) {
        <polygon class="area" [attr.points]="areaPoints()" />
        <polyline class="line" [attr.points]="linePoints()" />
        <circle
          class="head"
          [attr.cx]="lastPoint().x"
          [attr.cy]="lastPoint().y"
          r="2.4"
        />
      } @else {
        <line
          class="baseline"
          [attr.x1]="0"
          [attr.y1]="height - 1"
          [attr.x2]="width"
          [attr.y2]="height - 1"
        />
      }
    </svg>
  `,
  styles: `
    :host { display: block; width: 100%; }
    .spark { display: block; width: 100%; height: 100%; overflow: visible; }
    .line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.6;
      stroke-linejoin: round;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }
    .area { fill: color-mix(in srgb, var(--accent) 14%, transparent); stroke: none; }
    .head { fill: var(--accent); }
    .baseline { stroke: var(--border-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
  `,
})
export class Sparkline {
  /** Series values, oldest first. */
  readonly values = input.required<readonly number[]>();
  /** Upper bound for the y-axis (e.g. link capacity). */
  readonly max = input.required<number>();
  /** Accessible description of what the line represents. */
  readonly label = input<string>('trend');

  protected readonly width = 100;
  protected readonly height = 32;

  /** Normalized (x, y) points in the SVG viewBox, oldest → newest. */
  protected readonly points = computed<{ x: number; y: number }[]>(() => {
    const values = this.values();
    const n = values.length;
    if (n === 0) {
      return [];
    }
    const ceil = this.max() > 0 ? this.max() : Math.max(...values, 1);
    const stepX = n === 1 ? 0 : this.width / (n - 1);
    const pad = 2; // keep the head marker inside the box
    const usable = this.height - pad * 2;
    return values.map((v, i) => {
      const ratio = Math.max(0, Math.min(1, v / ceil));
      return {
        x: n === 1 ? this.width / 2 : i * stepX,
        y: pad + (1 - ratio) * usable,
      };
    });
  });

  protected readonly linePoints = computed(() =>
    this.points()
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' '),
  );

  protected readonly areaPoints = computed(() => {
    const pts = this.points();
    if (pts.length < 2) {
      return '';
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `${first.x.toFixed(2)},${this.height} ${this.linePoints()} ${last.x.toFixed(2)},${this.height}`;
  });

  protected readonly lastPoint = computed(
    () => this.points()[this.points().length - 1] ?? { x: 0, y: 0 },
  );

  protected readonly ariaLabel = computed(() => {
    const vals = this.values();
    if (vals.length === 0) {
      return `${this.label()}: no data`;
    }
    const latest = vals[vals.length - 1];
    return `${this.label()}: ${vals.length} samples, latest ${latest.toFixed(1)}`;
  });
}
