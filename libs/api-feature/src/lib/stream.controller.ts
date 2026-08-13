import { Controller, type MessageEvent, Sse } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { FleetEventBus } from './fleet-event-bus.js';
import type { FleetEvent } from './fleet-event.js';

/**
 * Live telemetry stream (M4). One SSE endpoint, `GET /api/stream`.
 *
 * The route is declared literally as `api/stream` on a prefix-less controller
 * so the assignment's `/api/stream` path is served WITHOUT adding a global
 * `/api` prefix that would move the already-merged M3 routes (`/links`,
 * `/fleet/summary`, …). Revisiting a uniform prefix is a later-milestone
 * decision.
 *
 * The controller is intentionally thin: it owns no state, no timer, no store.
 * It subscribes to the existing {@link FleetEventBus} and maps each application
 * {@link FleetEvent} to a NestJS `MessageEvent`; Nest serializes the stream as
 * `text/event-stream`. Each SSE connection Nest opens becomes an independent
 * subscription to the hot bus, and Nest tears that subscription down when the
 * client disconnects — so isolation and cleanup are handled by the framework,
 * not a hand-rolled subscriber registry.
 */
@Controller()
export class StreamController {
  constructor(private readonly bus: FleetEventBus) {}

  /**
   * `GET /api/stream` → `text/event-stream`.
   *
   * No custom buffering/backpressure layer is added: the bus is a hot Subject
   * that holds no backlog (a late subscriber sees only future events — the M4
   * live-only decision), the event rate is already bounded upstream
   * (one `link.telemetry` per sample, `link.status` on transition only, one
   * `fleet.summary` per tick), and Nest's `res.write` is non-blocking, so a
   * slow client cannot block others and per-client memory is bounded by the
   * socket buffer. Nothing is queued, so telemetry is inherently latest-wins.
   */
  @Sse('api/stream')
  stream(): Observable<MessageEvent> {
    return this.bus.events$().pipe(map((event) => this.toMessage(event)));
  }

  /**
   * Map an application event to an SSE frame. `type` becomes the `event:` name;
   * `data` (a domain object) is JSON-serialized by Nest. Telemetry frames carry
   * an informational `id:` derived from the sample timestamp — useful to a
   * client but NOT a replay key: the server keeps no replay buffer, and a
   * reconnect simply opens a fresh live subscription (gaps are recovered via the
   * REST telemetry history endpoint).
   */
  private toMessage(event: FleetEvent): MessageEvent {
    if (event.type === 'link.telemetry') {
      return {
        type: event.type,
        data: event.data,
        id: String(Date.parse(event.data.ts)),
      };
    }
    return { type: event.type, data: event.data };
  }
}
