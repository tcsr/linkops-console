import type { Link, LinkStatus, TelemetrySample } from '@linkops/domain';

/**
 * API representation of a link: the domain `Link` plus its derived status and
 * most recent telemetry sample. Status is always derived (never stored).
 */
export interface LinkView extends Link {
  readonly status: LinkStatus;
  readonly latestSample: TelemetrySample | null;
}

/** Response shape for `GET /links/:id/telemetry`. */
export interface TelemetryWindowView {
  readonly linkId: string;
  readonly windowMs: number;
  readonly count: number;
  readonly samples: readonly TelemetrySample[];
}
