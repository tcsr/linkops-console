import type { LinkId } from './link-id.js';

/**
 * Operational status of a link, derived from its latest telemetry.
 * Lowercase to match the official assignment contract.
 * See {@link deriveLinkStatus} for the rules.
 */
export type LinkStatus = 'up' | 'degraded' | 'down';

/** Radio frequency band. Values per the assignment domain model. */
export type Band = '5GHz' | '5.8GHz' | '11GHz' | '24GHz';

/** Link topology. Values per the assignment domain model. */
export type LinkMode = 'PtP' | 'PtMP' | 'S2S';

/** Channel width in MHz. Values per the assignment domain model. */
export type ChannelWidth = 20 | 40 | 80;

/**
 * A managed radio link in the fleet.
 *
 * `version` is a monotonically increasing integer used for optimistic
 * concurrency control (see the repository contract). `createdAt`/`updatedAt`
 * are ISO-8601 strings.
 */
export interface Link {
  readonly id: LinkId;
  readonly name: string;
  readonly siteA: string;
  readonly siteB: string;
  readonly band: Band;
  readonly mode: LinkMode;
  readonly channelWidthMhz: ChannelWidth;
  /** Provisioned capacity in Mbps (assignment range 10..1000); status denominator. */
  readonly capacityMbps: number;
  /** Transmit power in dBm. Assignment range: -10..30. */
  readonly txPowerDbm: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Fields a caller may supply when creating a link. */
export interface CreateLinkInput {
  readonly name: string;
  readonly siteA: string;
  readonly siteB: string;
  readonly band: Band;
  readonly mode: LinkMode;
  readonly channelWidthMhz: ChannelWidth;
  readonly capacityMbps: number;
  /** Transmit power in dBm. Assignment constraint: -10..30. */
  readonly txPowerDbm: number;
}

/**
 * Partial patch for an update. Identity, version, and audit timestamps are
 * managed by the repository and therefore not directly patchable.
 */
export type UpdateLinkInput = Partial<CreateLinkInput>;

/** Link-name constraints from the assignment: 3..40 characters, unique. */
export const LINK_NAME_CONSTRAINTS = {
  minLength: 3,
  maxLength: 40,
} as const;

/** Filters for listing links. Kept minimal for M1; extended as UI needs grow. */
export interface LinkListQuery {
  readonly band?: Band;
  readonly mode?: LinkMode;
  /** Case-insensitive substring match against name / siteA / siteB. */
  readonly search?: string;
}
