import {
  linkId,
  DuplicateLinkNameError,
  InvalidLinkNameError,
  LINK_NAME_CONSTRAINTS,
  LinkNotFoundError,
  VersionConflictError,
  type CreateLinkInput,
  type Link,
  type LinkId,
  type LinkListQuery,
  type LinkRepository,
  type TelemetrySample,
  type UpdateLinkInput,
} from '@linkops/domain';
import { RingBuffer } from './ring-buffer.js';

/** One telemetry sample per second for 5 minutes. */
export const DEFAULT_TELEMETRY_CAPACITY = 300;

export interface InMemoryLinkRepositoryOptions {
  /** Injectable clock (epoch ms) for deterministic timestamps. */
  readonly clock?: () => number;
  /** Injectable id generator for deterministic ids in tests. */
  readonly idFactory?: () => LinkId;
  /** Ring-buffer capacity per link. Defaults to 300. */
  readonly telemetryCapacity?: number;
  /** Initial links to load (e.g. from {@link createSeedLinks}). */
  readonly seed?: readonly Link[];
}

/**
 * In-memory {@link LinkRepository}.
 *
 * Links live in a `Map<LinkId, Link>`; each link's telemetry lives in its own
 * bounded {@link RingBuffer}. Clock and id generation are injectable so the
 * whole repository is deterministic under test. A durable implementation
 * (MongoDB) can replace this class without changing feature-layer call sites.
 */
export class InMemoryLinkRepository implements LinkRepository {
  private readonly links = new Map<LinkId, Link>();
  private readonly telemetry = new Map<LinkId, RingBuffer<TelemetrySample>>();
  private readonly clock: () => number;
  private readonly telemetryCapacity: number;
  private readonly idFactory: () => LinkId;
  private sequence = 0;

  constructor(options: InMemoryLinkRepositoryOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.telemetryCapacity =
      options.telemetryCapacity ?? DEFAULT_TELEMETRY_CAPACITY;

    for (const link of options.seed ?? []) {
      this.links.set(link.id, link);
    }
    this.sequence = this.links.size;

    this.idFactory =
      options.idFactory ??
      (() => linkId(`link-${String(++this.sequence).padStart(4, '0')}`));
  }

  async list(query: LinkListQuery): Promise<Link[]> {
    const search = query.search?.trim().toLowerCase();
    return [...this.links.values()].filter((link) => {
      if (query.band !== undefined && link.band !== query.band) {
        return false;
      }
      if (query.mode !== undefined && link.mode !== query.mode) {
        return false;
      }
      if (search !== undefined && search.length > 0) {
        const haystack =
          `${link.name} ${link.siteA} ${link.siteB}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }

  async getById(id: LinkId): Promise<Link | undefined> {
    return this.links.get(id);
  }

  async create(input: CreateLinkInput): Promise<Link> {
    this.assertNameValid(input.name);
    this.assertNameUnique(input.name);
    const nowIso = new Date(this.clock()).toISOString();
    const link: Link = {
      ...input,
      id: this.idFactory(),
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.links.set(link.id, link);
    return link;
  }

  async update(
    id: LinkId,
    patch: UpdateLinkInput,
    expectedVersion: number,
  ): Promise<Link> {
    const current = this.links.get(id);
    if (current === undefined) {
      throw new LinkNotFoundError(id);
    }
    if (current.version !== expectedVersion) {
      throw new VersionConflictError(id, expectedVersion, current.version);
    }

    if (patch.name !== undefined && patch.name !== current.name) {
      this.assertNameValid(patch.name);
      this.assertNameUnique(patch.name, id);
    }

    const updated: Link = {
      ...current,
      ...patch,
      // Repository-managed fields cannot be overwritten by a patch.
      id: current.id,
      version: current.version + 1,
      createdAt: current.createdAt,
      updatedAt: new Date(this.clock()).toISOString(),
    };
    this.links.set(id, updated);
    return updated;
  }

  async delete(id: LinkId): Promise<void> {
    if (!this.links.has(id)) {
      throw new LinkNotFoundError(id);
    }
    this.links.delete(id);
    this.telemetry.delete(id);
  }

  appendSample(sample: TelemetrySample): void {
    let buffer = this.telemetry.get(sample.linkId);
    if (buffer === undefined) {
      buffer = new RingBuffer<TelemetrySample>(this.telemetryCapacity);
      this.telemetry.set(sample.linkId, buffer);
    }
    buffer.push(sample);
  }

  getSamples(id: LinkId, windowMs: number): TelemetrySample[] {
    const buffer = this.telemetry.get(id);
    if (buffer === undefined || buffer.size === 0) {
      return [];
    }
    const all = buffer.toArray();
    // Window is measured relative to the newest stored sample so the result is
    // deterministic and clock-independent. NOTE (M2/M3): once real telemetry
    // timestamps and the REST telemetry-window contract land, revisit whether
    // the window should instead be measured from wall-clock "now".
    const newest = Date.parse(all[all.length - 1].ts);
    const threshold = newest - windowMs;
    return all.filter((sample) => Date.parse(sample.ts) >= threshold);
  }

  latestSample(id: LinkId): TelemetrySample | undefined {
    return this.telemetry.get(id)?.last();
  }

  /** Enforce the assignment's link-name length constraint (3..40). */
  private assertNameValid(name: string): void {
    const { minLength, maxLength } = LINK_NAME_CONSTRAINTS;
    if (name.length < minLength || name.length > maxLength) {
      throw new InvalidLinkNameError(
        name,
        `must be ${minLength}..${maxLength} characters`,
      );
    }
  }

  /** Enforce link-name uniqueness, optionally ignoring the link being updated. */
  private assertNameUnique(name: string, ignoreId?: LinkId): void {
    for (const link of this.links.values()) {
      if (link.id !== ignoreId && link.name === name) {
        throw new DuplicateLinkNameError(name);
      }
    }
  }
}
