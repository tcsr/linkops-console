import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';

/**
 * Root application providers.
 *
 * `provideZonelessChangeDetection()` runs the app without zone.js (bonus B3):
 * change detection is driven purely by signals. This is an approved
 * architecture/bonus decision, not a mandatory PDF requirement — it aligns with
 * the signal-first state and the assignment's "no change-detection storm at
 * 1 Hz" concern.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
  ],
};
