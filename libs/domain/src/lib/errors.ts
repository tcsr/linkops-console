import type { LinkId } from './link-id.js';

/**
 * Base class for all domain errors. Framework-independent: these carry no HTTP
 * status, no Nest/Angular coupling. Transport layers (M3 REST) are responsible
 * for mapping them to protocol-specific responses.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    // Preserve the concrete subclass name across transpilation targets.
    this.name = new.target.name;
  }
}

/** Raised when a link is looked up (or mutated) by an id that does not exist. */
export class LinkNotFoundError extends DomainError {
  constructor(public readonly id: LinkId) {
    super(`Link not found: ${id}`);
  }
}

/**
 * Raised by an optimistic update when the caller's `expectedVersion` does not
 * match the persisted version, i.e. the entity changed underneath the caller.
 */
export class VersionConflictError extends DomainError {
  constructor(
    public readonly id: LinkId,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Version conflict for link ${id}: expected ${expectedVersion}, found ${actualVersion}`,
    );
  }
}

/** Raised by {@link linkId} when the raw value cannot form a valid identifier. */
export class InvalidLinkIdError extends DomainError {
  constructor(public readonly raw: string) {
    super(`Invalid LinkId: "${raw}"`);
  }
}

/**
 * Raised when a link name violates its constraint (assignment: 3..40 chars).
 */
export class InvalidLinkNameError extends DomainError {
  constructor(
    public readonly linkName: string,
    public readonly reason: string,
  ) {
    super(`Invalid link name "${linkName}": ${reason}`);
  }
}

/** Raised when a link name collides with an existing link (names are unique). */
export class DuplicateLinkNameError extends DomainError {
  constructor(public readonly linkName: string) {
    super(`Link name already in use: "${linkName}"`);
  }
}
