import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

/** Parse the API_KEYS env value: comma-separated bearer keys. */
export function parseApiKeys(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function keysMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Bearer API-key middleware. With no keys configured the API refuses all
 * requests rather than failing open.
 */
export function apiKeyAuth(keys: string[]) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (keys.length === 0) {
      throw new ApiError('unauthorized', 'No API keys are configured on the server');
    }
    if (!match || !keys.some((k) => keysMatch(k, match[1]!))) {
      throw new ApiError('unauthorized', 'Missing or invalid API key');
    }
    await next();
  });
}
