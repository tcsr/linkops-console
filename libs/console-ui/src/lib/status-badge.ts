import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { LinkStatus } from '@linkops/domain';

/** Colored pill (dot + label) for a link's derived status. Presentational only. */
@Component({
  selector: 'lo-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="badge"
    [class.up]="status() === 'up'"
    [class.degraded]="status() === 'degraded'"
    [class.down]="status() === 'down'"
    [attr.aria-label]="'status: ' + status()"
    ><span class="dot" aria-hidden="true"></span>{{ status() }}</span
  >`,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.65rem 0.25rem 0.55rem;
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }
    .dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent);
    }
    .up { color: var(--up); background: var(--up-dim); border-color: color-mix(in srgb, var(--up) 25%, transparent); }
    .degraded { color: var(--degraded); background: var(--degraded-dim); border-color: color-mix(in srgb, var(--degraded) 25%, transparent); }
    .down { color: var(--down); background: var(--down-dim); border-color: color-mix(in srgb, var(--down) 25%, transparent); }
    
    .badge:hover {
      transform: translateY(-0.5px);
    }
    .badge.up:hover { box-shadow: 0 0 8px color-mix(in srgb, var(--up) 30%, transparent); }
    .badge.degraded:hover { box-shadow: 0 0 8px color-mix(in srgb, var(--degraded) 30%, transparent); }
    .badge.down:hover { box-shadow: 0 0 8px color-mix(in srgb, var(--down) 30%, transparent); }
  `,
})
export class StatusBadge {
  readonly status = input.required<LinkStatus>();
}
