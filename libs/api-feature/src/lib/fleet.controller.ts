import { Controller, Get } from '@nestjs/common';
import type { FleetSummary } from '@linkops/domain';
import { FleetService } from './fleet.service.js';

/** REST endpoint for the fleet summary. */
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('summary')
  summary(): Promise<FleetSummary> {
    return this.fleet.summary();
  }
}
