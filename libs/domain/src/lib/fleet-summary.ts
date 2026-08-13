import type { LinkId } from './link-id.js';

/**
 * Aggregate view of the fleet, matching the official assignment contract.
 * `total` equals `up + degraded + down`. Consumed by the fleet overview (M5);
 * defined here so the aggregate shape lives in the domain vocabulary.
 */
export interface FleetSummary {
  readonly total: number;
  readonly up: number;
  readonly degraded: number;
  readonly down: number;
  /** Mean instantaneous throughput across the fleet, in Mbps. */
  readonly avgThroughputMbps: number;
  /** Id of the worst-performing link, or `null` when the fleet is empty. */
  readonly worstLinkId: LinkId | null;
}
