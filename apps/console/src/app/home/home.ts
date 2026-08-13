import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Placeholder landing view for the Angular infrastructure phase. The real fleet
 * view (KPI header + sortable/filterable live link list) replaces this in a
 * later M5 phase.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="padding: 2rem; max-width: 60rem; margin: 0 auto;">
      <h1>LinkOps Console</h1>
      <p style="color: var(--muted);">
        Angular 22 (zoneless, signal-first) shell is up. Fleet view arrives in a
        later M5 phase.
      </p>
    </main>
  `,
})
export class Home {}
