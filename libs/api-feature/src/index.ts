// Public API of the @linkops/api-feature layer (NestJS REST module).
export { ApiModule } from './lib/api.module.js';
export { LINK_REPOSITORY } from './lib/tokens.js';
export { LinksService } from './lib/links.service.js';
export { FleetService } from './lib/fleet.service.js';
export { ApiExceptionFilter } from './lib/api-exception.filter.js';
export { FleetEventBus } from './lib/fleet-event-bus.js';
export { TelemetryStreamService } from './lib/telemetry-stream.service.js';
export { StreamController } from './lib/stream.controller.js';
export type {
  FleetEvent,
  FleetSummaryEvent,
  LinkStatusEvent,
  LinkStatusEventData,
  LinkTelemetryEvent,
} from './lib/fleet-event.js';
export type { LinkView, TelemetryWindowView } from './lib/link-view.js';
export type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorEnvelope,
} from './lib/error-envelope.js';
