import type { TelemetrySample } from './telemetry-sample.js';

/**
 * Outbound port for a completed telemetry tick (M4 dependency inversion seam).
 *
 * A producer (the telemetry simulator, in `api-data-access`) hands the whole
 * batch of samples generated in one tick to whatever wants to react to it —
 * without the producer knowing anything about that consumer. The M4 SSE stream
 * layer will implement this port in `api-feature`; the domain stays free of any
 * transport, RxJS, or NestJS concern.
 *
 * Deliberately framework-independent and minimal:
 *  - one call per tick, carrying the full batch (not one call per sample);
 *  - synchronous and side-effect-only (`void`) — the producer never awaits it,
 *    so a slow or throwing consumer cannot stall or reorder telemetry;
 *  - no `FleetEvent`, `MessageEvent`, or streaming vocabulary — those are
 *    application/transport concerns that live outside the domain.
 */
export interface TelemetrySink {
  /**
   * Receive the samples produced by one completed telemetry tick.
   *
   * @param samples All samples generated in the tick, one per live link. May be
   *   empty if the fleet is empty. Implementations must treat the array as
   *   read-only and must not assume the producer awaits this call.
   */
  emit(samples: readonly TelemetrySample[]): void;
}
