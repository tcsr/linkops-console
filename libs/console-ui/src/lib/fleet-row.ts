import type { Band, LinkStatus } from '@linkops/domain';

/**
 * Presentational view-model for one fleet-list row. Built from domain types
 * only (this is `type:ui`, which may depend on `type:domain` alone). The
 * feature layer maps its data-access model onto this shape, so the UI stays
 * transport-agnostic.
 */
export interface FleetRow {
  readonly id: string;
  readonly name: string;
  readonly siteA: string;
  readonly siteB: string;
  readonly band: Band;
  readonly status: LinkStatus;
  readonly capacityMbps: number;
  /** Latest throughput, or null before the first sample arrives. */
  readonly throughputMbps: number | null;
}
