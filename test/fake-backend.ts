import { ApiError } from '../src/errors.js';
import type { SheetsBackend, SpreadsheetMeta } from '../src/sheets-client.js';

/** In-memory SheetsBackend: sheetId → tab name → grid (header row first). */
export class FakeBackend implements SheetsBackend {
  constructor(
    private store: Map<string, Map<string, string[][]>>,
    private title = 'Fake spreadsheet',
  ) {}

  static withSheet(sheetId: string, tabs: Record<string, string[][]>): FakeBackend {
    return new FakeBackend(new Map([[sheetId, new Map(Object.entries(tabs))]]));
  }

  private sheet(sheetId: string): Map<string, string[][]> {
    const sheet = this.store.get(sheetId);
    if (!sheet) throw new ApiError('not_found', 'Spreadsheet not found');
    return sheet;
  }

  private grid(sheetId: string, tab: string): string[][] {
    const grid = this.sheet(sheetId).get(tab);
    if (!grid) throw new ApiError('not_found', `Tab "${tab}" not found`);
    return grid;
  }

  async getMeta(sheetId: string): Promise<SpreadsheetMeta> {
    return {
      title: this.title,
      tabs: [...this.sheet(sheetId).entries()].map(([title, grid]) => ({
        title,
        rowCount: grid.length,
        columnCount: grid[0]?.length ?? 0,
      })),
    };
  }

  async getValues(sheetId: string, tab: string): Promise<string[][]> {
    return this.grid(sheetId, tab).map((row) => [...row]);
  }

  async appendRows(sheetId: string, tab: string, rows: string[][]): Promise<void> {
    this.grid(sheetId, tab).push(...rows.map((r) => [...r]));
  }

  async updateRow(
    sheetId: string,
    tab: string,
    rowNumber: number,
    cells: Map<number, string>,
  ): Promise<void> {
    const row = this.grid(sheetId, tab)[rowNumber - 1];
    if (!row) throw new ApiError('not_found', `Row ${rowNumber} does not exist`);
    for (const [col, value] of cells) {
      while (row.length <= col) row.push('');
      row[col] = value;
    }
  }

  async deleteRow(sheetId: string, tab: string, rowNumber: number): Promise<void> {
    const grid = this.grid(sheetId, tab);
    if (rowNumber > grid.length) throw new ApiError('not_found', `Row ${rowNumber} does not exist`);
    grid.splice(rowNumber - 1, 1);
  }
}
