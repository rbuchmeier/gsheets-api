import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiKeyAuth } from './auth.js';
import { errorResponse } from './errors.js';
import type { Registry } from './registry.js';
import { sheetRoutes } from './routes/sheets.js';
import type { SheetsBackend } from './sheets-client.js';

export interface AppDeps {
  registry: Registry;
  backend: SheetsBackend;
  apiKeys: string[];
}

export function buildApp({ registry, backend, apiKeys }: AppDeps) {
  const app = new Hono();

  app.onError((err, c) => errorResponse(c, err));
  app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'] }));

  app.get('/healthz', (c) => c.json({ ok: true }));

  app.use('/v1/*', apiKeyAuth(apiKeys));
  app.route('/v1/sheets', sheetRoutes({ registry, backend }));

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` } }, 404),
  );

  return app;
}
