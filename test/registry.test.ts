import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { Registry, type SheetRegistration } from '../src/registry.js';

const REG: SheetRegistration = {
  slug: 'expenses',
  sheetId: 'abc123',
  title: 'Expenses',
  ops: ['read', 'append'],
};

describe('Registry', () => {
  it('resolves a registered slug', () => {
    expect(new Registry([REG]).resolve('expenses').sheetId).toBe('abc123');
  });

  it('throws 404 for an unknown slug', () => {
    try {
      new Registry([REG]).resolve('nope');
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError).code).toBe('not_found');
    }
  });

  it('rejects duplicate slugs at construction', () => {
    expect(() => new Registry([REG, REG])).toThrowError(/Duplicate slug/);
  });

  it.each([
    ['bad slug format', { ...REG, slug: 'Has Spaces' }],
    ['empty sheetId', { ...REG, sheetId: '' }],
    ['empty ops', { ...REG, ops: [] as unknown as SheetRegistration['ops'] }],
    ['unknown op', { ...REG, ops: ['read', 'explode'] as unknown as SheetRegistration['ops'] }],
  ])('rejects invalid registration: %s', (_label, reg) => {
    expect(() => new Registry([reg])).toThrow();
  });

  it('enforces the ops allowlist', () => {
    const registry = new Registry([REG]);
    const reg = registry.resolve('expenses');
    expect(() => registry.assertOp(reg, 'read')).not.toThrow();
    try {
      registry.assertOp(reg, 'delete');
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError).code).toBe('forbidden');
    }
  });
});
