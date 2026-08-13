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
      padding: 0.2rem 0.6rem 0.2rem 0.5rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid transparent;
    }
    .dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
    }
    .up { color: var(--up, #34d399); background: var(--up-dim, rgba(52, 211, 153, 0.13)); border-color: color-mix(in srgb, var(--up, #34d399) 35%, transparent); }
    .degraded { color: var(--degraded, #fbbf24); background: var(--degraded-dim, rgba(251, 191, 36, 0.13)); border-color: color-mix(in srgb, var(--degraded, #fbbf24) 35%, transparent); }
    .down { color: var(--down, #f87171); background: var(--down-dim, rgba(248, 113, 113, 0.13)); border-color: color-mix(in srgb, var(--down, #f87171) 35%, transparent); }
  `,
})
export class StatusBadge {
  readonly status = input.required<LinkStatus>();
}
