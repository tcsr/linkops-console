import type {
  CreateLinkInput,
  LinkStatus,
  TelemetrySample,
  UpdateLinkInput,
} from '@linkops/domain';

/**
 * Client view-model for `GET /links/:id/telemetry`. Mirrors the server's
 * `TelemetryWindowView` shape, but is declared here so the console owns its own
 * view of the contract (a `scope:console` library must not import `scope:api`).
 */
export interface TelemetryWindow {
  readonly linkId: string;
  readonly windowMs: number;
  readonly count: number;
  readonly samples: readonly TelemetrySample[];
}

/** Body for `POST /links` — the full create payload (domain input). */
export type CreateLinkPayload = CreateLinkInput;

/**
 * Body for `PATCH /links/:id` — a partial patch plus the optimistic-concurrency
 * `expectedVersion` the server requires. A stale value yields 409 (surfaced as a
 * {@link ConsoleApiError}; the M7 milestone owns the resolution UX).
 */
export interface UpdateLinkPayload extends UpdateLinkInput {
  readonly expectedVersion: number;
}

/**
 * Console-side view of the API error envelope
 * (`{ error: { code, message, statusCode, details? } }`). Declared here rather
 * than imported from `scope:api` so the boundary stays one-directional.
 */
export interface ConsoleApiError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly details?: unknown;
}

interface HttpErrorLike {
  readonly status: number;
  readonly error: unknown;
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'error' in value
  );
}

/**
 * Normalize an unknown thrown value (typically an `HttpErrorResponse`) into a
 * {@link ConsoleApiError}, reading the server envelope when present and falling
 * back to sensible messages for transport-level failures. Pure and
 * framework-free so it is trivially unit-testable.
 */
export function parseApiError(err: unknown): ConsoleApiError {
  if (!isHttpErrorLike(err)) {
    return { code: 'UNKNOWN', message: 'Unexpected error.', status: 0 };
  }
  const status = err.status;
  const envelope = err.error;
  if (
    typeof envelope === 'object' &&
    envelope !== null &&
    'error' in envelope &&
    typeof (envelope as { error: unknown }).error === 'object' &&
    (envelope as { error: unknown }).error !== null
  ) {
    const body = (envelope as { error: Record<string, unknown> }).error;
    const code = typeof body['code'] === 'string' ? body['code'] : 'UNKNOWN';
    const message =
      typeof body['message'] === 'string'
        ? body['message']
        : 'Request failed.';
    return { code, message, status, details: body['details'] };
  }
  if (status === 0) {
    return { code: 'NETWORK', message: 'Could not reach the API.', status };
  }
  return { code: 'UNKNOWN', message: `Request failed (${String(status)}).`, status };
}

/** Live-or-snapshot status for the detail header. */
export type DetailStatus = LinkStatus;
