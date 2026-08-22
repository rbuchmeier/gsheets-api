import { serve } from '@hono/node-server';
import { sheets } from '../sheets.config.js';
import { buildApp } from './app.js';
import { parseApiKeys } from './auth.js';
import { Registry } from './registry.js';
import { GoogleSheetsBackend } from './sheets-client.js';

const app = buildApp({
  registry: new Registry(sheets),
  backend: new GoogleSheetsBackend(),
  apiKeys: parseApiKeys(process.env.API_KEYS),
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`gsheets-api listening on port ${info.port}`);
});
