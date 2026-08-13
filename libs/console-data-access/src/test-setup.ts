// Zoneless Angular test environment (no zone.js), matching the app's
// provideZonelessChangeDetection() bootstrap.
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv();
