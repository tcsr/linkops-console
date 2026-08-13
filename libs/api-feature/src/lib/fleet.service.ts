import { Inject, Injectable } from '@nestjs/common';
import {
  deriveLinkStatus,
  type FleetSummary,
  type LinkId,
  type LinkRepository,
  type LinkStatus,
} from '@linkops/domain';
import { LINK_REPOSITORY } from './tokens.js';

const STATUS_RANK: Record<LinkStatus, number> = { down: 0, degraded: 1, up: 2 };

/**
 * Computes the domain {@link FleetSummary}. Status is derived per link via the
 * domain rule — there is no second/competing status calculation here.
 */
@Injectable()
export class FleetService {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
  ) {}

  async summary(): Promise<FleetSummary> {
    const now = new Date();
    const links = await this.repository.list({});

    let up = 0;
    let degraded = 0;
    let down = 0;
    let throughputSum = 0;
    let throughputCount = 0;

    let worstLinkId: LinkId | null = null;
    let worstRank = Number.POSITIVE_INFINITY;
    let worstThroughput = Number.POSITIVE_INFINITY;

    for (const link of links) {
      const latest = this.repository.latestSample(link.id);
      const status = deriveLinkStatus(link, latest, now);

      if (status === 'up') up++;
      else if (status === 'degraded') degraded++;
      else down++;

      const throughput = latest?.throughputMbps ?? 0;
      if (latest !== undefined) {
        throughputSum += latest.throughputMbps;
        throughputCount++;
      }

      // "Worst" = lowest status rank, tie-broken by lowest throughput then id.
      const rank = STATUS_RANK[status];
      if (
        rank < worstRank ||
        (rank === worstRank && throughput < worstThroughput) ||
        (rank === worstRank &&
          throughput === worstThroughput &&
          worstLinkId !== null &&
          link.id < worstLinkId)
      ) {
        worstRank = rank;
        worstThroughput = throughput;
        worstLinkId = link.id;
      }
    }

    const avgThroughputMbps =
      throughputCount === 0
        ? 0
        : Math.round((throughputSum / throughputCount) * 100) / 100;

    return {
      total: links.length,
      up,
      degraded,
      down,
      avgThroughputMbps,
      worstLinkId,
    };
  }
}
