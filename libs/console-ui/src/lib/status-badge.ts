import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { LinkStatus } from '@linkops/domain';

/** Colored badge for a link's derived status. Presentational only. */
@Component({
  selector: 'lo-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="badge"
    [class.up]="status() === 'up'"
    [class.degraded]="status() === 'degraded'"
    [class.down]="status() === 'down'"
    [attr.aria-label]="'status: ' + status()"
    >{{ status() }}</span
  >`,
  styles: `
    .badge {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #0b0e12;
    }
    .up { background: var(--up, #2ea043); }
    .degraded { background: var(--degraded, #d29922); }
    .down { background: var(--down, #f85149); color: #fff; }
  `,
})
export class StatusBadge {
  readonly status = input.required<LinkStatus>();
}
