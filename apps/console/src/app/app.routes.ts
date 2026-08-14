import type { Routes } from '@angular/router';
import {
  FleetView,
  LinkDetailView,
  LinkFormView,
} from '@linkops/console-feature';

/**
 * Application routes. The fleet list is the default; link detail and the
 * create/edit form are reached from it. `links/new` is declared before the
 * parameterized routes so it is not captured as an `:id`. Route params are
 * bound to component inputs (see `provideRouter(..., withComponentInputBinding())`).
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: FleetView,
  },
  {
    path: 'links/new',
    component: LinkFormView,
  },
  {
    path: 'links/:id/edit',
    component: LinkFormView,
  },
  {
    path: 'links/:id',
    component: LinkDetailView,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
