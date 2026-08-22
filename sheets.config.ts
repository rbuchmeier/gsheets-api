import type { SheetRegistration } from './src/registry.js';

/**
 * The sheet registry. To register a Google Sheet:
 *
 *   1. Share the sheet with the service account email (see docs/SETUP.md).
 *   2. Add an entry below. The slug becomes the URL path: /v1/sheets/<slug>/rows
 *   3. Push to main — GitHub Actions redeploys automatically.
 */
export const sheets: SheetRegistration[] = [
  {
    slug: 'example',
    sheetId: 'REPLACE_WITH_A_REAL_GOOGLE_SHEET_ID',
    title: 'Example sheet',
    ops: ['read', 'append', 'update', 'delete'],
  },
];
