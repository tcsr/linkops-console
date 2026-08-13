import { InvalidLinkIdError } from './errors.js';

/**
 * `LinkId` is a branded string. The `__brand` phantom property exists only in
 * the type system (it is never present at runtime), which prevents a raw
 * `string` from being passed where a validated `LinkId` is expected.
 */
export type LinkId = string & {
  readonly __brand: 'LinkId';
};

/**
 * Smallest constraint that still guarantees a usable identifier:
 * a non-empty, trimmed string. Anything stricter (UUID, prefix scheme) is not
 * mandated by the assignment, so it is intentionally left out.
 *
 * @throws {InvalidLinkIdError} when `raw` is empty or whitespace-only.
 */
export function linkId(raw: string): LinkId {
  const value = raw.trim();
  if (value.length === 0) {
    throw new InvalidLinkIdError(raw);
  }
  return value as LinkId;
}
