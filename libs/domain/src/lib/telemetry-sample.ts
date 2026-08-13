import type { LinkId } from './link-id.js';

/**
 * A single point-in-time radio telemetry reading for one link.
 *
 * `ts` is an ISO-8601 timestamp string, matching the official assignment
 * contract. Consumers that need to compare samples numerically parse it via
 * `Date.parse(ts)`. Sample generation (the 1 Hz simulator) is out of M1 scope.
 */
export interface TelemetrySample {
  readonly linkId: LinkId;
  /** ISO-8601 timestamp when the sample was observed. */
  readonly ts: string;
  /** Received signal strength indicator, in dBm (negative values). */
  readonly rssiDbm: number;
  /** Signal-to-noise ratio in decibels. */
  readonly snrDb: number;
  /** Instantaneous user throughput in megabits per second. */
  readonly throughputMbps: number;
}
