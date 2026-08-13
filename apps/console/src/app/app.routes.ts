import type { Routes } from '@angular/router';
import { FleetView } from '@linkops/console-feature';

/** Application routes. The fleet view is the default (and only, in M5) route. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: FleetView,
  },
];
