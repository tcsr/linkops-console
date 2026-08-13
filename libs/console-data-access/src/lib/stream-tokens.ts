import { InjectionToken } from '@angular/core';

/**
 * Opens an SSE connection. Injectable so tests can substitute a fake
 * `EventSource` and drive frames deterministically. Default = the browser API.
 */
export type EventSourceFactory = (url: string) => EventSource;

export const EVENT_SOURCE_FACTORY = new InjectionToken<EventSourceFactory>(
  'EVENT_SOURCE_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url: string) => new EventSource(url),
  },
);

/**
 * Batches work to the next paint. Injectable so tests flush deterministically
 * without real animation frames. Default = `requestAnimationFrame`.
 */
export interface FrameScheduler {
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}

export const FRAME_SCHEDULER = new InjectionToken<FrameScheduler>(
  'FRAME_SCHEDULER',
  {
    providedIn: 'root',
    factory: (): FrameScheduler => ({
      schedule: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    }),
  },
);
