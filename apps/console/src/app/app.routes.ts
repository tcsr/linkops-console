import type { Routes } from '@angular/router';

/** Application routes. The fleet view is the default (and only, in M5) route. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('@linkops/console-feature').then((m) => m.FleetView),
  },
];
