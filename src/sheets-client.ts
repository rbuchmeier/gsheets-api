import { sheets as sheetsApi, type sheets_v4 } from '@googleapis/sheets';
import { GoogleAuth } from 'google-auth-library';
import { ApiError } from './errors.js';

export interface TabMeta {
  title: string;
  rowCount: number;
  columnCount: number;
}

/**
 * The minimal Sheets surface the app needs. The real implementation talks to
 * the Google Sheets API; tests use an in-memory fake.
 *
 * All row values are the raw cell grid (arrays of strings), header included.
 */
export interface SpreadsheetMeta {
  /** The spreadsheet's actual document title in Google Drive. */
  title: string;
  tabs: TabMeta[];
}

export interface SheetsBackend {
  getMeta(sheetId: string): Promise<SpreadsheetMeta>;
  /** Full value grid of one tab, header row first. */
  getValues(sheetId: string, tab: string): Promise<string[][]>;
  /** Append rows (raw cell arrays) after the last data row of the tab. */
  appendRows(sheetId: string, tab: string, rows: string[][]): Promise<void>;
  /** Overwrite specific cells of one row. `cells` maps 0-based column index → value. */
  updateRow(sheetId: string, tab: string, rowNumber: number, cells: Map<number, string>): Promise<void>;
  /** Delete one row (1-based sheet row number) from the tab. */
  deleteRow(sheetId: string, tab: string, rowNumber: number): Promise<void>;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Quote a tab name for use in an A1 range. */
function tabRange(tab: string, range?: string): string {
  const quoted = `'${tab.replace(/'/g, "''")}'`;
  return range ? `${quoted}!${range}` : quoted;
}

export class GoogleSheetsBackend implements SheetsBackend {
  private client: sheets_v4.Sheets;

  constructor(client?: sheets_v4.Sheets) {
    this.client =
      client ??
      sheetsApi({
        version: 'v4',
        auth: new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] }),
      });
  }

  private async tabId(sheetId: string, tab: string): Promise<number> {
    const meta = await this.wrap(() => this.client.spreadsheets.get({ spreadsheetId: sheetId }));
    const found = meta.data.sheets?.find((s) => s.properties?.title === tab);
    if (found?.properties?.sheetId == null) {
      throw new ApiError('not_found', `Tab "${tab}" not found`);
    }
    return found.properties.sheetId;
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const status =
        (err as { status?: number; code?: number }).status ?? (err as { code?: number }).code;
      if (status === 404) {
        throw new ApiError(
          'not_found',
          'Spreadsheet not found (is it shared with the service account?)',
        );
      }
      if (status === 403) {
        throw new ApiError(
          'upstream_error',
          'The service account does not have access to this spreadsheet',
        );
      }
      throw new ApiError('upstream_error', 'Google Sheets API request failed');
    }
  }

  async getMeta(sheetId: string): Promise<SpreadsheetMeta> {
    const meta = await this.wrap(() => this.client.spreadsheets.get({ spreadsheetId: sheetId }));
    return {
      title: meta.data.properties?.title ?? '',
      tabs: (meta.data.sheets ?? []).map((s) => ({
        title: s.properties?.title ?? '',
        rowCount: s.properties?.gridProperties?.rowCount ?? 0,
        columnCount: s.properties?.gridProperties?.columnCount ?? 0,
      })),
    };
  }

  async getValues(sheetId: string, tab: string): Promise<string[][]> {
    const res = await this.wrap(() =>
      this.client.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: tabRange(tab),
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
    );
    return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? '')));
  }

  async appendRows(sheetId: string, tab: string, rows: string[][]): Promise<void> {
    await this.wrap(() =>
      this.client.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: tabRange(tab, 'A1'),
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      }),
    );
  }

  async updateRow(
    sheetId: string,
    tab: string,
    rowNumber: number,
    cells: Map<number, string>,
  ): Promise<void> {
    const data = [...cells.entries()].map(([col, value]) => ({
      range: tabRange(tab, `${columnLetter(col)}${rowNumber}`),
      values: [[value]],
    }));
    await this.wrap(() =>
      this.client.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data },
      }),
    );
  }

  async deleteRow(sheetId: string, tab: string, rowNumber: number): Promise<void> {
    const tabId = await this.tabId(sheetId, tab);
    await this.wrap(() =>
      this.client.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: tabId,
                  dimension: 'ROWS',
                  startIndex: rowNumber - 1,
                  endIndex: rowNumber,
                },
              },
            },
          ],
        },
      }),
    );
  }
}
