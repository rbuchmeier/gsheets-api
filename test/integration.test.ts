import { describe, expect, it } from 'vitest';
import { GoogleSheetsBackend } from '../src/sheets-client.js';

/**
 * Round-trip against a real throwaway Google Sheet. Runs only when
 * INTEGRATION_SHEET_ID is set (locally with ADC, or in CI with WIF).
 * The target tab's row 1 must be headers: name | status
 */
const SHEET_ID = process.env.INTEGRATION_SHEET_ID;

describe.skipIf(!SHEET_ID)('Google Sheets integration', () => {
  it('appends, reads, updates, and deletes a row', async () => {
    const backend = new GoogleSheetsBackend();
    const sheetId = SHEET_ID!;
    const [tab] = await backend.getTabs(sheetId);
    expect(tab).toBeDefined();
    const tabName = tab!.title;
    const marker = `it-${process.pid}`;

    await backend.appendRows(sheetId, tabName, [[marker, 'pending']]);
    let grid = await backend.getValues(sheetId, tabName);
    const rowNumber = grid.findIndex((r) => r[0] === marker) + 1;
    expect(rowNumber).toBeGreaterThan(1);

    await backend.updateRow(sheetId, tabName, rowNumber, new Map([[1, 'done']]));
    grid = await backend.getValues(sheetId, tabName);
    expect(grid[rowNumber - 1]).toEqual([marker, 'done']);

    await backend.deleteRow(sheetId, tabName, rowNumber);
    grid = await backend.getValues(sheetId, tabName);
    expect(grid.some((r) => r[0] === marker)).toBe(false);
  }, 60_000);
});
