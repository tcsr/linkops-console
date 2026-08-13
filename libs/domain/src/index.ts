// Public API of the framework-independent domain layer.
export { linkId } from './lib/link-id.js';
export type { LinkId } from './lib/link-id.js';

export { LINK_NAME_CONSTRAINTS } from './lib/link.js';
export type {
  Band,
  ChannelWidth,
  CreateLinkInput,
  Link,
  LinkListQuery,
  LinkMode,
  LinkStatus,
  UpdateLinkInput,
} from './lib/link.js';
export type { TelemetrySample } from './lib/telemetry-sample.js';
export type { TelemetrySink } from './lib/telemetry-sink.js';
export type { FleetSummary } from './lib/fleet-summary.js';

export {
  deriveLinkStatus,
  LINK_STATUS_THRESHOLDS,
} from './lib/derive-link-status.js';

export {
  DomainError,
  DuplicateLinkNameError,
  InvalidLinkIdError,
  InvalidLinkNameError,
  LinkNotFoundError,
  VersionConflictError,
} from './lib/errors.js';

export type { LinkRepository } from './lib/link-repository.js';
