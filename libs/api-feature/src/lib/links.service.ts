import { Inject, Injectable } from '@nestjs/common';
import {
  deriveLinkStatus,
  linkId,
  LinkNotFoundError,
  type CreateLinkInput,
  type Link,
  type LinkListQuery,
  type LinkRepository,
  type LinkStatus,
  type UpdateLinkInput,
} from '@linkops/domain';
import { LINK_REPOSITORY } from './tokens.js';
import type { LinkView, TelemetryWindowView } from './link-view.js';
import type { CreateLinkDto } from './dto/create-link.dto.js';
import type { UpdateLinkDto } from './dto/update-link.dto.js';
import type { ListLinksQueryDto } from './dto/list-links-query.dto.js';
import { DEFAULT_TELEMETRY_WINDOW_MS } from './dto/telemetry-query.dto.js';

const STATUS_RANK: Record<LinkStatus, number> = { down: 0, degraded: 1, up: 2 };

/**
 * Application logic for links. Depends only on the repository abstraction and
 * the domain; it never touches the Map/RingBuffer internals. Derived status is
 * computed here via the domain rule so controllers stay thin.
 */
@Injectable()
export class LinksService {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
  ) {}

  async list(query: ListLinksQueryDto): Promise<LinkView[]> {
    // band/mode/search are domain-level filters handled by the repository.
    const repoQuery: LinkListQuery = {
      band: query.band,
      mode: query.mode,
      search: query.search,
    };
    const now = new Date();
    const links = await this.repository.list(repoQuery);

    let views = links.map((link) => this.toView(link, now));

    // status is derived, so status-filtering happens in the feature layer.
    if (query.status !== undefined) {
      views = views.filter((v) => v.status === query.status);
    }

    return this.sort(views, query.sort, query.order);
  }

  async getById(id: string): Promise<LinkView> {
    const link = await this.requireLink(id);
    return this.toView(link, new Date());
  }

  async create(dto: CreateLinkDto): Promise<LinkView> {
    const input: CreateLinkInput = {
      name: dto.name,
      siteA: dto.siteA,
      siteB: dto.siteB,
      band: dto.band,
      mode: dto.mode,
      channelWidthMhz: dto.channelWidthMhz,
      capacityMbps: dto.capacityMbps,
      txPowerDbm: dto.txPowerDbm,
    };
    const link = await this.repository.create(input);
    return this.toView(link, new Date());
  }

  async update(id: string, dto: UpdateLinkDto): Promise<LinkView> {
    const key = linkId(id);
    const patch: UpdateLinkInput = {
      name: dto.name,
      siteA: dto.siteA,
      siteB: dto.siteB,
      band: dto.band,
      mode: dto.mode,
      channelWidthMhz: dto.channelWidthMhz,
      capacityMbps: dto.capacityMbps,
      txPowerDbm: dto.txPowerDbm,
    };
    const link = await this.repository.update(key, patch, dto.expectedVersion);
    return this.toView(link, new Date());
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(linkId(id));
  }

  async telemetry(
    id: string,
    windowMs: number = DEFAULT_TELEMETRY_WINDOW_MS,
  ): Promise<TelemetryWindowView> {
    const link = await this.requireLink(id); // 404 if unknown
    const samples = this.repository.getSamples(link.id, windowMs);
    return { linkId: link.id, windowMs, count: samples.length, samples };
  }

  /** Fetch a link or throw LinkNotFoundError (→ 404 via the exception filter). */
  private async requireLink(id: string): Promise<Link> {
    const key = linkId(id);
    const link = await this.repository.getById(key);
    if (link === undefined) {
      // Reuse the domain's not-found error for consistent 404 mapping.
      throw new LinkNotFoundError(key);
    }
    return link;
  }

  private toView(link: Link, now: Date): LinkView {
    const latest = this.repository.latestSample(link.id);
    return {
      ...link,
      status: deriveLinkStatus(link, latest, now),
      latestSample: latest ?? null,
    };
  }

  private sort(
    views: LinkView[],
    field: ListLinksQueryDto['sort'],
    order: ListLinksQueryDto['order'],
  ): LinkView[] {
    if (field === undefined) {
      return views;
    }
    const key = field; // capture as const so narrowing survives inside the closure
    const dir = order === 'desc' ? -1 : 1;
    const cmp = (a: LinkView, b: LinkView): number => {
      switch (key) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'capacityMbps':
          return (a.capacityMbps - b.capacityMbps) * dir;
        case 'status':
          return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir;
        case 'createdAt':
          return a.createdAt.localeCompare(b.createdAt) * dir;
        case 'updatedAt':
          return a.updatedAt.localeCompare(b.updatedAt) * dir;
      }
    };
    // copy before sorting to avoid mutating the input array
    return [...views].sort(cmp);
  }
}
