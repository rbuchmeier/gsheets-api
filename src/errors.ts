import type { Context } from 'hono';

export type ErrorCode =
  'unauthorized' | 'not_found' | 'forbidden' | 'bad_request' | 'upstream_error' | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, 400 | 401 | 403 | 404 | 500 | 502> = {
  unauthorized: 401,
  not_found: 404,
  forbidden: 403,
  bad_request: 400,
  upstream_error: 502,
  internal_error: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get status() {
    return STATUS_BY_CODE[this.code];
  }
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'internal_error', message: 'An unexpected error occurred' } }, 500);
}
