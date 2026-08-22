import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { Registry, SheetRegistration } from '../registry.js';
import {
  filterRows,
  parseHeaders,
  toCellArray,
  toCellUpdates,
  toRowObjects,
  type RowQuery,
} from '../rows.js';
import type { SheetsBackend } from '../sheets-client.js';

const rowValues = z.record(z.string(), z.string());
const appendBody = z.union([rowValues, z.array(rowValues).nonempty()]);

export interface SheetRoutesDeps {
  registry: Registry;
  backend: SheetsBackend;
}

async function resolveTab(
  backend: SheetsBackend,
  reg: SheetRegistration,
  tabParam: string | undefined,
): Promise<string> {
  const { tabs } = await backend.getMeta(reg.sheetId);
  if (tabParam === undefined) {
    const first = tabs[0];
    if (!first) throw new ApiError('not_found', 'Spreadsheet has no tabs');
    return first.title;
  }
  if (!tabs.some((t) => t.title === tabParam)) {
    throw new ApiError('not_found', `Tab "${tabParam}" not found`);
  }
  return tabParam;
}

function parseRowNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2) {
    throw new ApiError('bad_request', 'Row number must be an integer >= 2 (row 1 is the header)');
  }
  return n;
}

function parseRowQuery(searchParams: URLSearchParams): RowQuery {
  const where: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    const match = /^where\[(.+)\]$/.exec(key);
    if (match) where[match[1]!] = value;
  }
  const parseIntParam = (name: string): number | undefined => {
    const raw = searchParams.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new ApiError('bad_request', `"${name}" must be a non-negative integer`);
    }
    return n;
  };
  return { where, limit: parseIntParam('limit'), offset: parseIntParam('offset') };
}

async function parseBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON');
  }
}

export function sheetRoutes({ registry, backend }: SheetRoutesDeps) {
  const app = new Hono();

  app.get('/', (c) => {
    const sheets = registry.list().map(({ slug, title, ops }) => ({ slug, title, ops }));
    return c.json({ sheets });
  });

  app.get('/:slug', async (c) => {
    const reg = registry.resolve(c.req.param('slug'));
    registry.assertOp(reg, 'read');
    const meta = await backend.getMeta(reg.sheetId);
    return c.json({
      slug: reg.slug,
      title: reg.title,
      spreadsheetTitle: meta.title,
      ops: reg.ops,
      tabs: meta.tabs,
    });
  });

  app.get('/:slug/rows', async (c) => {
    const reg = registry.resolve(c.req.param('slug'));
    registry.assertOp(reg, 'read');
    const tab = await resolveTab(backend, reg, c.req.query('tab'));
    const grid = await backend.getValues(reg.sheetId, tab);
    const query = parseRowQuery(new URL(c.req.url).searchParams);
    const rows = filterRows(toRowObjects(grid), query);
    return c.json({ tab, rows });
  });

  app.post('/:slug/rows', async (c) => {
    const reg = registry.resolve(c.req.param('slug'));
    registry.assertOp(reg, 'append');
    const tab = await resolveTab(backend, reg, c.req.query('tab'));

    const parsed = appendBody.safeParse(await parseBody(c));
    if (!parsed.success) {
      throw new ApiError('bad_request', 'Body must be an object (or array of objects) of string values');
    }
    const bodies = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    const grid = await backend.getValues(reg.sheetId, tab);
    const headers = parseHeaders(grid);
    await backend.appendRows(
      reg.sheetId,
      tab,
      bodies.map((b) => toCellArray(headers, b)),
    );
    return c.json({ tab, appended: bodies.length }, 201);
  });

  app.patch('/:slug/rows/:row', async (c) => {
    const reg = registry.resolve(c.req.param('slug'));
    registry.assertOp(reg, 'update');
    const tab = await resolveTab(backend, reg, c.req.query('tab'));
    const rowNumber = parseRowNumber(c.req.param('row'));

    const parsed = rowValues.safeParse(await parseBody(c));
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      throw new ApiError('bad_request', 'Body must be a non-empty object of string values');
    }

    const grid = await backend.getValues(reg.sheetId, tab);
    if (rowNumber > grid.length) {
      throw new ApiError('not_found', `Row ${rowNumber} does not exist (last row is ${grid.length})`);
    }
    const headers = parseHeaders(grid);
    await backend.updateRow(reg.sheetId, tab, rowNumber, toCellUpdates(headers, parsed.data));
    return c.json({ tab, updated: rowNumber });
  });

  app.delete('/:slug/rows/:row', async (c) => {
    const reg = registry.resolve(c.req.param('slug'));
    registry.assertOp(reg, 'delete');
    const tab = await resolveTab(backend, reg, c.req.query('tab'));
    const rowNumber = parseRowNumber(c.req.param('row'));

    const grid = await backend.getValues(reg.sheetId, tab);
    if (rowNumber > grid.length) {
      throw new ApiError('not_found', `Row ${rowNumber} does not exist (last row is ${grid.length})`);
    }
    await backend.deleteRow(reg.sheetId, tab, rowNumber);
    return c.json({ tab, deleted: rowNumber });
  });

  return app;
}
