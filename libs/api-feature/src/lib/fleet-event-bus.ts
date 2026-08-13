import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { FleetEvent } from './fleet-event.js';

/**
 * In-process multicast bus for {@link FleetEvent}s.
 *
 * A single hot `Subject` fans one published event out to every current
 * subscriber. Deliberately minimal and stateless:
 *  - **no replay/history:** a late subscriber sees only events published after
 *    it subscribes (no `ReplaySubject`/`BehaviorSubject`), matching the M4
 *    live-only decision — historical gaps are recovered via the REST telemetry
 *    endpoint, not the stream;
 *  - **no broker, no persistence, no unbounded queue:** the Subject holds no
 *    backlog; each event is delivered synchronously to whoever is subscribed;
 *  - **DI-scoped, not a global singleton:** Nest owns its single instance.
 *
 * The future SSE controller subscribes via {@link events$}; the
 * `TelemetryStreamService` produces via {@link publish}.
 */
@Injectable()
export class FleetEventBus implements OnModuleDestroy {
  private readonly subject = new Subject<FleetEvent>();

  /** Multicast one event to all current subscribers. No-op if none. */
  publish(event: FleetEvent): void {
    this.subject.next(event);
  }

  /** Cold view of the live event stream; each subscriber is independent. */
  events$(): Observable<FleetEvent> {
    return this.subject.asObservable();
  }

  /** Complete the stream on shutdown so subscribers terminate cleanly. */
  onModuleDestroy(): void {
    this.subject.complete();
  }
}
