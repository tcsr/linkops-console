// Public API of @linkops/console-data-access (Angular client data layer).
export type { ConsoleFleetEvent } from './lib/fleet-event';
export { FLEET_EVENT_TYPES, parseFleetEvent } from './lib/fleet-event';
export type { FleetLinkView, FleetModel } from './lib/fleet-model';
export { EMPTY_FLEET, applyEvents, fromSnapshot } from './lib/fleet-model';
export { FleetApi } from './lib/fleet-api';
export { FleetStore } from './lib/fleet-store';
export type { LoadState, ConnectionState } from './lib/fleet-store';
export { LinkDetailStore, SPARKLINE_MAX_POINTS } from './lib/link-detail-store';
export type { DetailState } from './lib/link-detail-store';
export {
  parseApiError,
} from './lib/link-detail-model';
export type {
  ConsoleApiError,
  CreateLinkPayload,
  UpdateLinkPayload,
  TelemetryWindow,
} from './lib/link-detail-model';
export {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
  type EventSourceFactory,
  type FrameScheduler,
} from './lib/stream-tokens';
