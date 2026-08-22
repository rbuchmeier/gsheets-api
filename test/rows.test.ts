import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { filterRows, parseHeaders, toCellArray, toCellUpdates, toRowObjects } from '../src/rows.js';

const GRID = [
  ['name', 'status', 'amount'],
  ['Coffee', 'active', '4.50'],
  ['Rent', 'active', '1200'],
  ['Gym', 'cancelled', '30'],
];

describe('parseHeaders', () => {
  it('returns trimmed headers', () => {
    expect(parseHeaders([[' name ', 'status']])).toEqual(['name', 'status']);
  });

  it.each([
    ['empty grid', []],
    ['empty header row', [[]]],
    ['empty column name', [['name', '']]],
    ['duplicate header', [['name', 'name']]],
    ['reserved _row header', [['_row', 'name']]],
  ])('rejects %s with a 400', (_label, grid) => {
    expect(() => parseHeaders(grid as string[][])).toThrowError(ApiError);
    try {
      parseHeaders(grid as string[][]);
    } catch (err) {
      expect((err as ApiError).code).toBe('bad_request');
    }
  });
});

describe('toRowObjects', () => {
  it('keys rows by header and numbers them from 2', () => {
    expect(toRowObjects(GRID)[0]).toEqual({ _row: 2, name: 'Coffee', status: 'active', amount: '4.50' });
    expect(toRowObjects(GRID)[2]?._row).toBe(4);
  });

  it('pads ragged rows with empty strings', () => {
    const rows = toRowObjects([['a', 'b', 'c'], ['1']]);
    expect(rows[0]).toEqual({ _row: 2, a: '1', b: '', c: '' });
  });

  it('returns empty list for a header-only grid', () => {
    expect(toRowObjects([['a', 'b']])).toEqual([]);
  });
});

describe('filterRows', () => {
  const rows = toRowObjects(GRID);

  it('filters by exact match on where fields', () => {
    const result = filterRows(rows, { where: { status: 'active' } });
    expect(result.map((r) => r.name)).toEqual(['Coffee', 'Rent']);
  });

  it('combines multiple where fields with AND', () => {
    const result = filterRows(rows, { where: { status: 'active', name: 'Rent' } });
    expect(result).toHaveLength(1);
  });

  it('matches nothing for an unknown field', () => {
    expect(filterRows(rows, { where: { nope: 'x' } })).toEqual([]);
  });

  it('applies offset and limit after filtering', () => {
    const result = filterRows(rows, { where: {}, offset: 1, limit: 1 });
    expect(result.map((r) => r.name)).toEqual(['Rent']);
  });
});

describe('toCellArray / toCellUpdates', () => {
  const headers = ['name', 'status', 'amount'];

  it('orders values by header and blanks missing fields', () => {
    expect(toCellArray(headers, { status: 'active', name: 'Tea' })).toEqual(['Tea', 'active', '']);
  });

  it('maps update fields to column indexes', () => {
    expect(toCellUpdates(headers, { amount: '99' })).toEqual(new Map([[2, '99']]));
  });

  it.each([toCellArray, toCellUpdates])('rejects unknown fields with a 400', (fn) => {
    try {
      fn(headers, { bogus: 'x' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('bad_request');
      expect((err as ApiError).message).toContain('bogus');
    }
  });
});
