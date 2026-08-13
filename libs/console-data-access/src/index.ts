// Public API of @linkops/console-data-access (Angular client data layer).
export type { ConsoleFleetEvent } from './lib/fleet-event';
export { FLEET_EVENT_TYPES, parseFleetEvent } from './lib/fleet-event';
export type { FleetLinkView, FleetModel } from './lib/fleet-model';
export { EMPTY_FLEET, applyEvents, fromSnapshot } from './lib/fleet-model';
export { FleetApi } from './lib/fleet-api';
export { FleetStore } from './lib/fleet-store';
export type { LoadState, ConnectionState } from './lib/fleet-store';
export {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
  type EventSourceFactory,
  type FrameScheduler,
} from './lib/stream-tokens';
