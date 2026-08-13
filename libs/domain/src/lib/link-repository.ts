import type { LinkId } from './link-id.js';
import type {
  CreateLinkInput,
  Link,
  LinkListQuery,
  UpdateLinkInput,
} from './link.js';
import type { TelemetrySample } from './telemetry-sample.js';

/**
 * Persistence contract for links and their telemetry.
 *
 * CRUD is async (`Promise`-returning) so a future durable implementation
 * (e.g. MongoDB) can replace the in-memory one without touching call sites.
 * Telemetry access is synchronous: it is served from an in-process bounded
 * ring buffer that never performs I/O.
 *
 * This interface lives in the framework-independent domain layer and must not
 * reference any transport, ORM, or runtime concern.
 */
export interface LinkRepository {
  /** List links, optionally filtered. */
  list(query: LinkListQuery): Promise<Link[]>;

  /** Fetch a single link, or `undefined` if it does not exist. */
  getById(id: LinkId): Promise<Link | undefined>;

  /** Create a new link. The implementation assigns id, version, timestamps. */
  create(input: CreateLinkInput): Promise<Link>;

  /**
   * Optimistically update a link.
   * @throws {LinkNotFoundError} if the id is unknown.
   * @throws {VersionConflictError} if `expectedVersion` !== the stored version.
   */
  update(
    id: LinkId,
    patch: UpdateLinkInput,
    expectedVersion: number,
  ): Promise<Link>;

  /**
   * Delete a link and discard its telemetry.
   * @throws {LinkNotFoundError} if the id is unknown.
   */
  delete(id: LinkId): Promise<void>;

  /** Append one telemetry sample to a link's bounded buffer. O(1). */
  appendSample(sample: TelemetrySample): void;

  /**
   * Return the samples within the most recent `windowMs`, oldest-first.
   * The window is measured relative to the newest stored sample so that the
   * result is deterministic and independent of the wall clock.
   */
  getSamples(id: LinkId, windowMs: number): TelemetrySample[];

  /** The most recent sample for a link, or `undefined` if none. */
  latestSample(id: LinkId): TelemetrySample | undefined;
}
