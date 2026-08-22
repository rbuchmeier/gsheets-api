import { describe, expect, it } from 'vitest';
import { parseApiKeys } from '../src/auth.js';

describe('parseApiKeys', () => {
  it('splits on commas and trims whitespace', () => {
    expect(parseApiKeys(' key1 , key2,key3 ')).toEqual(['key1', 'key2', 'key3']);
  });

  it.each([undefined, '', ' , ,'])('returns no keys for %j', (raw) => {
    expect(parseApiKeys(raw)).toEqual([]);
  });
});
