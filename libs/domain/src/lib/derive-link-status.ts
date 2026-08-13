import type { Link, LinkStatus } from './link.js';
import type { TelemetrySample } from './telemetry-sample.js';

/**
 * Status-derivation thresholds. Exported so tests and documentation reference a
 * single source of truth rather than duplicating magic numbers.
 */
export const LINK_STATUS_THRESHOLDS = {
  /** A sample older than this (ms) is considered stale -> DOWN. */
  staleAfterMs: 5_000,
  up: {
    minSnrDb: 18,
    /** throughput must be >= this fraction of capacity. */
    minThroughputRatio: 0.6,
  },
  degraded: {
    minSnrDb: 10,
    minThroughputRatio: 0.2,
  },
} as const;

/**
 * Derive a link's operational status from its most recent telemetry sample.
 *
 * Rules (evaluated top-down; first match wins):
 *  1. down      — no sample, or the sample is stale by more than 5s.
 *  2. up        — snrDb >= 18 AND throughputMbps >= 0.6 * capacityMbps.
 *  3. degraded  — snrDb >= 10 AND throughputMbps >= 0.2 * capacityMbps.
 *  4. down      — otherwise.
 *
 * The current time is supplied by the caller (`now`) rather than read from the
 * clock, so the function is pure and deterministic. No hysteresis in M1.
 */
export function deriveLinkStatus(
  link: Link,
  latest: TelemetrySample | undefined,
  now: Date,
): LinkStatus {
  if (latest === undefined) {
    return 'down';
  }

  const ageMs = now.getTime() - Date.parse(latest.ts);
  if (ageMs > LINK_STATUS_THRESHOLDS.staleAfterMs) {
    return 'down';
  }

  const { snrDb, throughputMbps } = latest;
  const { capacityMbps } = link;

  if (
    snrDb >= LINK_STATUS_THRESHOLDS.up.minSnrDb &&
    throughputMbps >= LINK_STATUS_THRESHOLDS.up.minThroughputRatio * capacityMbps
  ) {
    return 'up';
  }

  if (
    snrDb >= LINK_STATUS_THRESHOLDS.degraded.minSnrDb &&
    throughputMbps >=
      LINK_STATUS_THRESHOLDS.degraded.minThroughputRatio * capacityMbps
  ) {
    return 'degraded';
  }

  return 'down';
}
