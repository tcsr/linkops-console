import { parseApiError } from './link-detail-model';

describe('parseApiError', () => {
  it('reads the server error envelope (code, message, details)', () => {
    const err = {
      status: 409,
      error: {
        error: {
          code: 'VERSION_CONFLICT',
          message: 'Link was modified by someone else',
          details: { expectedVersion: 3, actualVersion: 4 },
        },
      },
    };
    const parsed = parseApiError(err);
    expect(parsed.code).toBe('VERSION_CONFLICT');
    expect(parsed.message).toBe('Link was modified by someone else');
    expect(parsed.status).toBe(409);
    expect(parsed.details).toEqual({ expectedVersion: 3, actualVersion: 4 });
  });

  it('maps a status-0 transport failure to a NETWORK error', () => {
    const parsed = parseApiError({ status: 0, error: null });
    expect(parsed.code).toBe('NETWORK');
    expect(parsed.status).toBe(0);
  });

  it('falls back to a generic message for an envelope-less HTTP error', () => {
    const parsed = parseApiError({ status: 500, error: 'boom' });
    expect(parsed.code).toBe('UNKNOWN');
    expect(parsed.message).toContain('500');
  });

  it('handles a non-HTTP thrown value', () => {
    const parsed = parseApiError(new Error('nope'));
    expect(parsed.code).toBe('UNKNOWN');
    expect(parsed.status).toBe(0);
  });
});
