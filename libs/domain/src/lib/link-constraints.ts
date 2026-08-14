import type { Band, ChannelWidth, LinkMode } from './link.js';

/**
 * Canonical, runtime allow-lists and numeric ranges for link fields — the
 * shared source of truth the assignment asks for. Client-side form validation
 * (M6) mirrors these; the server still enforces the identical rules at the HTTP
 * boundary (its `class-validator` DTOs use the same numbers). Kept in the
 * framework-independent domain so neither Nest nor Angular owns the contract.
 */
export const BANDS: readonly Band[] = ['5GHz', '5.8GHz', '11GHz', '24GHz'];
export const MODES: readonly LinkMode[] = ['PtP', 'PtMP', 'S2S'];
export const CHANNEL_WIDTHS: readonly ChannelWidth[] = [20, 40, 80];

/** Provisioned capacity range in Mbps (assignment: 10..1000). */
export const CAPACITY_MBPS = { min: 10, max: 1000 } as const;

/** Transmit power range in dBm (assignment: -10..30). */
export const TX_POWER_DBM = { min: -10, max: 30 } as const;

/** Site label length bounds (non-empty; server caps at 80). */
export const SITE_LENGTH = { min: 1, max: 80 } as const;
