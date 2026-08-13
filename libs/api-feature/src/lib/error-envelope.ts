/**
 * Consistent API error envelope.
 *
 * M0 does not define an exact envelope, so this shape is an explicit
 * implementation decision (documented in the README / architecture docs). Every
 * error response — validation, domain, or unexpected — is serialized as:
 *
 * ```json
 * { "error": { "code", "message", "statusCode", "timestamp", "path", "details"? } }
 * ```
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'LINK_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DUPLICATE_LINK_NAME'
  | 'INVALID_LINK_NAME'
  | 'INVALID_LINK_ID'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiErrorBody {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly timestamp: string;
  readonly path: string;
  readonly details?: unknown;
}

export interface ApiErrorEnvelope {
  readonly error: ApiErrorBody;
}
