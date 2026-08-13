import { Inject, Injectable } from '@nestjs/common';
import {
  deriveLinkStatus,
  type LinkId,
  type LinkRepository,
  type LinkStatus,
  type TelemetrySample,
  type TelemetrySink,
} from '@linkops/domain';
import { LINK_REPOSITORY } from './tokens.js';
import { FleetEventBus } from './fleet-event-bus.js';
import { FleetService } from './fleet.service.js';

/**
 * Turns each completed telemetry tick into {@link FleetEvent}s on the
 * {@link FleetEventBus}. It is the application/streaming layer between the
 * framework-free simulator (which only produces samples) and the future SSE
 * transport (which only serializes events).
 *
 * It implements the domain {@link TelemetrySink} port, so the simulator depends
 * on it structurally — never the other way round. It owns NO authoritative
 * state: the repository stays the single source of current links and telemetry
 * history. The only state kept here is a `Map<LinkId, LinkStatus>` used purely
 * to detect status transitions, so `link.status` is emitted on change only.
 *
 * Per completed tick the deterministic event order is:
 *   1. `link.telemetry` — one per sample, in repository/batch order,
 *   2. `link.status`    — for links whose derived status changed, same order,
 *   3. `fleet.summary`  — exactly one, reflecting the fleet after the tick.
 *
 * Status is derived via the domain rule using each sample's own timestamp as
 * "now" (a just-produced sample is never stale), keeping transition detection
 * deterministic and independent of the wall clock.
 */
@Injectable()
export class TelemetryStreamService implements TelemetrySink {
  /** Last emitted status per link — for transition detection only. */
  private readonly lastStatus = new Map<LinkId, LinkStatus>();

  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
    private readonly bus: FleetEventBus,
    private readonly fleet: FleetService,
  ) {}

  /**
   * {@link TelemetrySink} entry point called by the simulator at end of tick.
   *
   * Fire-and-forget: the simulator never awaits the sink, and any failure in
   * event processing is contained here so it can never destabilize telemetry
   * production. The awaitable core is {@link handleTick} (used by tests).
   */
  emit(samples: readonly TelemetrySample[]): void {
    void this.handleTick(samples).catch((error: unknown) => {
      console.error('[telemetry-stream] tick processing failed', error);
    });
  }

  /**
   * Process one completed tick's batch into events. Awaitable so tests observe
   * emissions deterministically without timers.
   */
  async handleTick(samples: readonly TelemetrySample[]): Promise<void> {
    // Current fleet from the authoritative repository (never a local store).
    // A link deleted between sample generation and processing is absent here
    // and is therefore excluded from telemetry, status, and summary.
    const links = await this.repository.list({});
    const byId = new Map(links.map((link) => [link.id, link]));

    // 1. telemetry — one event per sample, in batch order.
    for (const sample of samples) {
      if (!byId.has(sample.linkId)) {
        continue;
      }
      this.bus.publish({ type: 'link.telemetry', data: sample });
    }

    // 2. status transitions — same order, emit only on change.
    for (const sample of samples) {
      const link = byId.get(sample.linkId);
      if (link === undefined) {
        continue;
      }
      const status = deriveLinkStatus(link, sample, new Date(sample.ts));
      const previous = this.lastStatus.get(sample.linkId) ?? null;
      if (status !== previous) {
        this.bus.publish({
          type: 'link.status',
          data: { linkId: sample.linkId, status, previous },
        });
      }
      this.lastStatus.set(sample.linkId, status);
    }

    // 3. prune tracking for links that left the fleet (bounded memory).
    for (const id of this.lastStatus.keys()) {
      if (!byId.has(id)) {
        this.lastStatus.delete(id);
      }
    }

    // 4. exactly one fleet.summary, reusing the existing application service.
    const summary = await this.fleet.summary();
    this.bus.publish({ type: 'fleet.summary', data: summary });
  }
}
