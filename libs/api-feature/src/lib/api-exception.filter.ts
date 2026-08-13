import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  DuplicateLinkNameError,
  InvalidLinkIdError,
  InvalidLinkNameError,
  LinkNotFoundError,
  VersionConflictError,
} from '@linkops/domain';
import type { ApiErrorBody, ApiErrorCode } from './error-envelope.js';

/** Minimal structural types so we don't couple the filter to express typings. */
interface ResLike {
  status(code: number): { json(body: unknown): void };
}
interface ReqLike {
  url: string;
}

interface Mapped {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Global filter that serializes every error as the consistent API envelope and
 * maps domain errors to HTTP semantics:
 *   - LinkNotFoundError        -> 404 LINK_NOT_FOUND
 *   - VersionConflictError     -> 409 VERSION_CONFLICT
 *   - DuplicateLinkNameError   -> 409 DUPLICATE_LINK_NAME
 *   - InvalidLinkNameError     -> 400 INVALID_LINK_NAME
 *   - InvalidLinkIdError       -> 400 INVALID_LINK_ID
 *   - ValidationPipe (400)     -> 400 VALIDATION_FAILED (field messages in details)
 * Unknown errors become 500 INTERNAL with a generic message (no storage/
 * framework internals leaked).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<ResLike>();
    const req = http.getRequest<ReqLike>();
    const mapped = this.map(exception);

    const body: ApiErrorBody = {
      code: mapped.code,
      message: mapped.message,
      statusCode: mapped.status,
      timestamp: new Date().toISOString(),
      path: req.url,
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
    };
    res.status(mapped.status).json({ error: body });
  }

  private map(exception: unknown): Mapped {
    if (exception instanceof LinkNotFoundError) {
      return { status: 404, code: 'LINK_NOT_FOUND', message: exception.message };
    }
    if (exception instanceof VersionConflictError) {
      return {
        status: 409,
        code: 'VERSION_CONFLICT',
        message: exception.message,
        details: {
          expectedVersion: exception.expectedVersion,
          actualVersion: exception.actualVersion,
        },
      };
    }
    if (exception instanceof DuplicateLinkNameError) {
      return {
        status: 409,
        code: 'DUPLICATE_LINK_NAME',
        message: exception.message,
      };
    }
    if (exception instanceof InvalidLinkNameError) {
      return {
        status: 400,
        code: 'INVALID_LINK_NAME',
        message: exception.message,
      };
    }
    if (exception instanceof InvalidLinkIdError) {
      return { status: 400, code: 'INVALID_LINK_ID', message: exception.message };
    }
    if (exception instanceof HttpException) {
      return this.mapHttp(exception);
    }
    return {
      status: 500,
      code: 'INTERNAL',
      message: 'Internal server error',
    };
  }

  private mapHttp(exception: HttpException): Mapped {
    const status = exception.getStatus();
    const response = exception.getResponse();
    // ValidationPipe puts field errors under `message` (string | string[]).
    const details =
      typeof response === 'object' && response !== null && 'message' in response
        ? (response as { message: unknown }).message
        : undefined;

    let code: ApiErrorCode = 'INTERNAL';
    if (status === HttpStatus.BAD_REQUEST) code = 'VALIDATION_FAILED';
    else if (status === HttpStatus.NOT_FOUND) code = 'NOT_FOUND';
    else if (status === HttpStatus.CONFLICT) code = 'VERSION_CONFLICT';

    const message =
      status === HttpStatus.BAD_REQUEST ? 'Validation failed' : exception.message;

    return { status, code, message, details };
  }
}
