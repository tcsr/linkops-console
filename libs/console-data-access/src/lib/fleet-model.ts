import type {
  FleetSummary,
  Link,
  LinkId,
  LinkStatus,
  TelemetrySample,
} from '@linkops/domain';
import type { ConsoleFleetEvent } from './fleet-event';

/**
 * One row of the fleet list: the link's configuration plus its live-derived
 * status and latest telemetry sample. Matches the shape `GET /links` returns
 * (the API's `LinkView`), which the console consumes as its snapshot.
 */
export type FleetLinkView = Link & {
  readonly status: LinkStatus;
  readonly latestSample: TelemetrySample | null;
};

/** Immutable fleet snapshot the UI renders. */
export interface FleetModel {
  readonly rows: ReadonlyMap<LinkId, FleetLinkView>;
  readonly summary: FleetSummary | null;
}

export const EMPTY_FLEET: FleetModel = { rows: new Map(), summary: null };

/** Build the initial model from the REST snapshot. */
export function fromSnapshot(
  links: readonly FleetLinkView[],
  summary: FleetSummary | null,
): FleetModel {
  const rows = new Map<LinkId, FleetLinkView>();
  for (const link of links) {
    rows.set(link.id, link);
  }
  return { rows, summary };
}

/**
 * Fold a coalesced batch of stream events into a new model, producing **one**
 * new model regardless of how many events the batch carries (the render
 * coalescing contract). Returns the same reference when nothing changed, so
 * signal consumers don't re-render on a no-op flush.
 *
 * - `link.telemetry` updates a row's `latestSample` (throughput/rssi/snr).
 * - `link.status` updates a row's `status` (skipped if unchanged).
 * - `fleet.summary` replaces the KPI block.
 * - Events for links absent from the snapshot are ignored (a link created after
 *   the snapshot appears only after the next full load; the M4 stream carries
 *   no per-link create/delete event).
 */
export function applyEvents(
  model: FleetModel,
  events: readonly ConsoleFleetEvent[],
): FleetModel {
  if (events.length === 0) {
    return model;
  }
  const rows = new Map(model.rows);
  let summary = model.summary;
  let changed = false;

  for (const event of events) {
    switch (event.type) {
      case 'link.telemetry': {
        const row = rows.get(event.data.linkId);
        if (row !== undefined) {
          rows.set(event.data.linkId, { ...row, latestSample: event.data });
          changed = true;
        }
        break;
      }
      case 'link.status': {
        const row = rows.get(event.data.linkId);
        if (row !== undefined && row.status !== event.data.status) {
          rows.set(event.data.linkId, { ...row, status: event.data.status });
          changed = true;
        }
        break;
      }
      case 'fleet.summary': {
        summary = event.data;
        changed = true;
        break;
      }
    }
  }

  return changed ? { rows, summary } : model;
}
