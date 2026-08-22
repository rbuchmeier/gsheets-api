import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Registry } from '../src/registry.js';
import { FakeBackend } from './fake-backend.js';

const SHEET_ID = 'sheet-abc';
const KEY = 'sk_test_key';
const AUTH = { Authorization: `Bearer ${KEY}` };
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' };

function makeApp(backend: FakeBackend) {
  const registry = new Registry([
    {
      slug: 'expenses',
      sheetId: SHEET_ID,
      title: 'Expenses',
      ops: ['read', 'append', 'update', 'delete'],
    },
    { slug: 'readonly', sheetId: SHEET_ID, title: 'Read Only', ops: ['read'] },
  ]);
  return buildApp({ registry, backend, apiKeys: [KEY] });
}

let backend: FakeBackend;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  backend = FakeBackend.withSheet(SHEET_ID, {
    Sheet1: [
      ['name', 'status'],
      ['Coffee', 'active'],
      ['Gym', 'cancelled'],
    ],
    Sheet2: [
      ['city', 'country'],
      ['Sydney', 'AU'],
    ],
  });
  app = makeApp(backend);
});

describe('auth', () => {
  it('health is open', async () => {
    expect((await app.request('/health')).status).toBe(200);
  });

  it.each([
    ['no header', {}],
    ['wrong key', { Authorization: 'Bearer wrong' }],
    ['non-bearer scheme', { Authorization: `Basic ${KEY}` }],
  ])('rejects %s with 401', async (_label, headers) => {
    const res = await app.request('/v1/sheets', { headers: headers as Record<string, string> });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('unauthorized');
  });

  it('rejects everything when no keys are configured', async () => {
    const noKeys = buildApp({ registry: new Registry([]), backend, apiKeys: [] });
    const res = await noKeys.request('/v1/sheets', { headers: AUTH });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/sheets', () => {
  it('lists registered sheets without exposing sheet IDs', async () => {
    const res = await app.request('/v1/sheets', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.sheets.map((s: { slug: string }) => s.slug)).toEqual(['expenses', 'readonly']);
    expect(JSON.stringify(body)).not.toContain(SHEET_ID);
  });
});

describe('GET /v1/sheets/:slug', () => {
  it('returns tab metadata', async () => {
    const res = await app.request('/v1/sheets/expenses', { headers: AUTH });
    const body = (await res.json()) as any;
    expect(body.tabs).toEqual([
      { title: 'Sheet1', rowCount: 3, columnCount: 2 },
      { title: 'Sheet2', rowCount: 2, columnCount: 2 },
    ]);
    expect(body.spreadsheetTitle).toBe('Fake spreadsheet');
    expect(JSON.stringify(body)).not.toContain(SHEET_ID);
  });

  it('404s for unknown slug', async () => {
    const res = await app.request('/v1/sheets/nope', { headers: AUTH });
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/sheets/:slug/rows', () => {
  it('returns header-keyed rows from the first tab by default', async () => {
    const res = await app.request('/v1/sheets/expenses/rows', { headers: AUTH });
    const body = (await res.json()) as any;
    expect(body.tab).toBe('Sheet1');
    expect(body.rows).toEqual([
      { _row: 2, name: 'Coffee', status: 'active' },
      { _row: 3, name: 'Gym', status: 'cancelled' },
    ]);
  });

  it('reads a named tab', async () => {
    const res = await app.request('/v1/sheets/expenses/rows?tab=Sheet2', { headers: AUTH });
    const body = (await res.json()) as any;
    expect(body.rows[0].city).toBe('Sydney');
  });

  it('404s for an unknown tab', async () => {
    const res = await app.request('/v1/sheets/expenses/rows?tab=Nope', { headers: AUTH });
    expect(res.status).toBe(404);
  });

  it('filters with where[] and paginates', async () => {
    const res = await app.request('/v1/sheets/expenses/rows?where[status]=active', { headers: AUTH });
    expect(((await res.json()) as any).rows).toEqual([{ _row: 2, name: 'Coffee', status: 'active' }]);

    const paged = await app.request('/v1/sheets/expenses/rows?offset=1&limit=1', { headers: AUTH });
    expect(((await paged.json()) as any).rows.map((r: { name: string }) => r.name)).toEqual(['Gym']);
  });

  it('400s on a bad limit', async () => {
    const res = await app.request('/v1/sheets/expenses/rows?limit=-1', { headers: AUTH });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/sheets/:slug/rows', () => {
  it('appends a single row keyed by header', async () => {
    const res = await app.request('/v1/sheets/expenses/rows', {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify({ status: 'active', name: 'Tea' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ tab: 'Sheet1', appended: 1 });
    expect(await backend.getValues(SHEET_ID, 'Sheet1')).toContainEqual(['Tea', 'active']);
  });

  it('appends multiple rows and blanks missing fields', async () => {
    const res = await app.request('/v1/sheets/expenses/rows', {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify([{ name: 'A' }, { name: 'B', status: 'active' }]),
    });
    expect(((await res.json()) as any).appended).toBe(2);
    expect(await backend.getValues(SHEET_ID, 'Sheet1')).toContainEqual(['A', '']);
  });

  it('400s on unknown fields, naming the field', async () => {
    const res = await app.request('/v1/sheets/expenses/rows', {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify({ bogus: 'x' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.message).toContain('bogus');
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['non-string values', JSON.stringify({ name: 42 })],
    ['empty array', JSON.stringify([])],
  ])('400s on %s', async (_label, body) => {
    const res = await app.request('/v1/sheets/expenses/rows', {
      method: 'POST',
      headers: JSON_AUTH,
      body,
    });
    expect(res.status).toBe(400);
  });

  it('403s on a read-only sheet', async () => {
    const res = await app.request('/v1/sheets/readonly/rows', {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /v1/sheets/:slug/rows/:row', () => {
  it('updates only the provided fields', async () => {
    const res = await app.request('/v1/sheets/expenses/rows/3', {
      method: 'PATCH',
      headers: JSON_AUTH,
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(200);
    expect(await backend.getValues(SHEET_ID, 'Sheet1')).toContainEqual(['Gym', 'active']);
  });

  it.each(['1', '0', 'abc', '2.5'])('400s on row "%s"', async (row) => {
    const res = await app.request(`/v1/sheets/expenses/rows/${row}`, {
      method: 'PATCH',
      headers: JSON_AUTH,
      body: JSON.stringify({ status: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s past the last row', async () => {
    const res = await app.request('/v1/sheets/expenses/rows/99', {
      method: 'PATCH',
      headers: JSON_AUTH,
      body: JSON.stringify({ status: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('400s on an empty body', async () => {
    const res = await app.request('/v1/sheets/expenses/rows/2', {
      method: 'PATCH',
      headers: JSON_AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('403s on a read-only sheet', async () => {
    const res = await app.request('/v1/sheets/readonly/rows/2', {
      method: 'PATCH',
      headers: JSON_AUTH,
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /v1/sheets/:slug/rows/:row', () => {
  it('deletes the row and shifts the rest up', async () => {
    const res = await app.request('/v1/sheets/expenses/rows/2', { method: 'DELETE', headers: AUTH });
    expect(res.status).toBe(200);
    expect(await backend.getValues(SHEET_ID, 'Sheet1')).toEqual([
      ['name', 'status'],
      ['Gym', 'cancelled'],
    ]);
  });

  it('refuses to delete the header row', async () => {
    const res = await app.request('/v1/sheets/expenses/rows/1', { method: 'DELETE', headers: AUTH });
    expect(res.status).toBe(400);
  });

  it('404s past the last row', async () => {
    const res = await app.request('/v1/sheets/expenses/rows/99', { method: 'DELETE', headers: AUTH });
    expect(res.status).toBe(404);
  });

  it('403s on a read-only sheet', async () => {
    const res = await app.request('/v1/sheets/readonly/rows/2', { method: 'DELETE', headers: AUTH });
    expect(res.status).toBe(403);
  });
});
