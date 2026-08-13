import type {
  FleetSummary,
  LinkId,
  LinkStatus,
  TelemetrySample,
} from '@linkops/domain';

/**
 * Application-level streaming events for the M4 live feed.
 *
 * These are transport-facing application concepts, NOT domain concepts, so they
 * live in `api-feature` rather than `libs/domain`. The shapes follow the
 * assignment's SSE contract (PDF §3 "SSE event shape") verbatim; the SSE
 * controller (a later phase) serializes each event's `data` as the `data:` line
 * under the matching `event:` name.
 */

/** One telemetry measurement for one link. Payload is the raw domain sample. */
export interface LinkTelemetryEvent {
  readonly type: 'link.telemetry';
  readonly data: TelemetrySample;
}

/**
 * Emitted only when a link's derived status transitions.
 *
 * Matches the PDF payload `{ linkId, status, previous }`. `previous` is `null`
 * for the first observation of a link (no prior status to transition from); no
 * separate timestamp field is carried because the contract does not define one.
 */
export interface LinkStatusEventData {
  readonly linkId: LinkId;
  readonly status: LinkStatus;
  readonly previous: LinkStatus | null;
}

export interface LinkStatusEvent {
  readonly type: 'link.status';
  readonly data: LinkStatusEventData;
}

/** The server-computed KPI block, emitted once per completed tick. */
export interface FleetSummaryEvent {
  readonly type: 'fleet.summary';
  readonly data: FleetSummary;
}

/**
 * Discriminated union of every event the live stream can publish. Consumers
 * narrow on `type`; the compiler guarantees exhaustive handling.
 */
export type FleetEvent =
  | LinkTelemetryEvent
  | LinkStatusEvent
  | FleetSummaryEvent;
