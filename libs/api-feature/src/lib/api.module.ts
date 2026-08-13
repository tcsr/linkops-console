import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import {
  InMemoryLinkRepository,
  TelemetrySimulatorService,
  createSeedLinks,
} from '@linkops/api-data-access';
import type { LinkRepository } from '@linkops/domain';
import { LINK_REPOSITORY } from './tokens.js';
import { LinksService } from './links.service.js';
import { FleetService } from './fleet.service.js';
import { LinksController } from './links.controller.js';
import { FleetController } from './fleet.controller.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { FleetEventBus } from './fleet-event-bus.js';
import { TelemetryStreamService } from './telemetry-stream.service.js';

/**
 * Root feature module for the REST API.
 *
 * - Binds the `LinkRepository` abstraction (token) to the in-memory
 *   implementation, seeded with the deterministic fleet.
 * - Registers `TelemetrySimulatorService` as a real NestJS provider so Nest
 *   owns its construction, DI, startup (`onModuleInit`) and shutdown
 *   (`onApplicationShutdown`) — no manual instantiation outside Nest.
 * - Applies the global validation pipe and exception filter.
 */
@Module({
  controllers: [LinksController, FleetController],
  providers: [
    {
      provide: LINK_REPOSITORY,
      useFactory: (): LinkRepository =>
        new InMemoryLinkRepository({ seed: createSeedLinks() }),
    },
    FleetEventBus,
    LinksService,
    FleetService,
    TelemetryStreamService,
    {
      // Wire the stream service in as the simulator's TelemetrySink (M4). The
      // simulator still only knows the domain port; Nest owns the composition,
      // so there is no simulator→feature/RxJS coupling.
      provide: TelemetrySimulatorService,
      useFactory: (
        repository: LinkRepository,
        sink: TelemetryStreamService,
      ): TelemetrySimulatorService =>
        new TelemetrySimulatorService(repository, { sink }),
      inject: [LINK_REPOSITORY, TelemetryStreamService],
    },
    {
      provide: APP_PIPE,
      useFactory: (): ValidationPipe =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class ApiModule {}
