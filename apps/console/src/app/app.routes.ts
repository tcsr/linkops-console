import type { Routes } from '@angular/router';

/**
 * Application routes. The fleet view is the default route; its feature
 * component is loaded lazily and lands in a later M5 phase.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./home/home').then((m) => m.Home),
  },
];
