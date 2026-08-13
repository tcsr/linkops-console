import type {
  FleetSummary,
  LinkId,
  LinkStatus,
  TelemetrySample,
} from '@linkops/domain';

/**
 * Console-side model of the SSE events the API streams over `GET /api/stream`.
 *
 * These mirror the wire contract (the API's `FleetEvent`, defined in
 * `api-feature`). The console cannot import that type — it lives in `scope:api`
 * — so both sides independently derive their shapes from the shared
 * `@linkops/domain` types, which is the single source of truth for the payloads.
 */
export type ConsoleFleetEvent =
  | { readonly type: 'link.telemetry'; readonly data: TelemetrySample }
  | {
      readonly type: 'link.status';
      readonly data: {
        readonly linkId: LinkId;
        readonly status: LinkStatus;
        readonly previous: LinkStatus | null;
      };
    }
  | { readonly type: 'fleet.summary'; readonly data: FleetSummary };

/** SSE event names the stream emits. */
export const FLEET_EVENT_TYPES = [
  'link.telemetry',
  'link.status',
  'fleet.summary',
] as const;

/**
 * Parse one SSE frame (`event` name + raw `data` JSON) into a typed event.
 *
 * Returns `null` for an unknown event name or unparseable JSON, so an
 * unexpected frame is ignored rather than crashing the stream — the client
 * treats the server payload defensively.
 */
export function parseFleetEvent(
  type: string,
  data: string,
): ConsoleFleetEvent | null {
  if (!FLEET_EVENT_TYPES.includes(type as (typeof FLEET_EVENT_TYPES)[number])) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  // The narrow cast is safe: `type` is validated above and the server is the
  // authority on payload shape (domain types). Malformed payloads surface as
  // runtime-empty fields, not crashes.
  return { type, data: payload } as ConsoleFleetEvent;
}
