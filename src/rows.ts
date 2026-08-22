import { ApiError } from './errors.js';

/** A data row as exposed by the API: header-keyed values plus its sheet row number. */
export interface RowObject {
  _row: number;
  [header: string]: string | number;
}

/**
 * Extract the header row. Headers must be non-empty and unique — the sheet's
 * first row defines the API field names, so problems are reported loudly.
 */
export function parseHeaders(grid: string[][]): string[] {
  const first = grid[0];
  if (!first || first.length === 0) {
    throw new ApiError('bad_request', 'Sheet tab has no header row (row 1 must contain column names)');
  }
  const headers = first.map((h) => h.trim());
  const seen = new Set<string>();
  for (const h of headers) {
    if (h === '') {
      throw new ApiError('bad_request', 'Header row contains an empty column name');
    }
    if (h === '_row') {
      throw new ApiError('bad_request', 'Header name "_row" is reserved');
    }
    if (seen.has(h)) {
      throw new ApiError('bad_request', `Duplicate header "${h}" in row 1`);
    }
    seen.add(h);
  }
  return headers;
}

/** Convert the raw grid into header-keyed row objects. Ragged rows are padded with "". */
export function toRowObjects(grid: string[][]): RowObject[] {
  const headers = parseHeaders(grid);
  return grid.slice(1).map((cells, i) => {
    const row: RowObject = { _row: i + 2 };
    headers.forEach((h, col) => {
      row[h] = cells[col] ?? '';
    });
    return row;
  });
}

export interface RowQuery {
  where: Record<string, string>;
  limit?: number;
  offset?: number;
}

export function filterRows(rows: RowObject[], query: RowQuery): RowObject[] {
  let result = rows;
  for (const [field, value] of Object.entries(query.where)) {
    result = result.filter((row) => row[field] === value);
  }
  const offset = query.offset ?? 0;
  const end = query.limit != null ? offset + query.limit : undefined;
  return result.slice(offset, end);
}

/**
 * Convert an API write body (header-keyed object) into a raw cell array.
 * Unknown keys are a 400 — they would silently drop data otherwise.
 */
export function toCellArray(headers: string[], body: Record<string, string>): string[] {
  assertKnownKeys(headers, body);
  return headers.map((h) => body[h] ?? '');
}

/** Map a partial update body to 0-based column index → value. */
export function toCellUpdates(headers: string[], body: Record<string, string>): Map<number, string> {
  assertKnownKeys(headers, body);
  const updates = new Map<number, string>();
  for (const [key, value] of Object.entries(body)) {
    updates.set(headers.indexOf(key), value);
  }
  return updates;
}

function assertKnownKeys(headers: string[], body: Record<string, string>): void {
  for (const key of Object.keys(body)) {
    if (!headers.includes(key)) {
      throw new ApiError(
        'bad_request',
        `Unknown field "${key}" — this sheet's columns are: ${headers.join(', ')}`,
      );
    }
  }
}
