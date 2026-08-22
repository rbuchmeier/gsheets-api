# gsheets-api

A REST API layered on top of your Google Sheets. Register a sheet and it gets
CRUD endpoints, with rows exposed as JSON objects keyed by the sheet's header row.

Runs on Cloud Run, deployed automatically by GitHub Actions on every push to
`main` — so registering a sheet is a two-minute, no-console workflow.

## Registering a sheet

1. Share the Google Sheet with the runtime service account email
   (`gsheets-api-runtime@<project>.iam.gserviceaccount.com` — Editor access for
   writes, Viewer is enough for read-only).
2. Add an entry to [`sheets.config.ts`](sheets.config.ts):

   ```ts
   {
     slug: 'expenses',                  // becomes the URL path
     sheetId: '1AbC...xyz',             // from the sheet's URL
     title: 'Household expenses',
     ops: ['read', 'append', 'update', 'delete'],  // per-sheet allowlist
   }
   ```

3. Push to `main`. Done.

Row 1 of each tab must be a header row with unique, non-empty column names —
those names become the JSON field names.

## API

All `/v1` routes require `Authorization: Bearer <api key>`. Every row-level
route accepts `?tab=<name>`; it defaults to the first tab. Raw Google sheet IDs
never appear in URLs or responses — slugs are the public names.

```
GET    /health                           liveness (no auth)
GET    /v1/sheets                        registered sheets
GET    /v1/sheets/{slug}                 tab metadata
GET    /v1/sheets/{slug}/rows            list rows
GET    /v1/sheets/{slug}/rows?where[status]=active&limit=50&offset=0
POST   /v1/sheets/{slug}/rows            append (object, or array of objects)
PATCH  /v1/sheets/{slug}/rows/{row}      update fields of one row
DELETE /v1/sheets/{slug}/rows/{row}      delete one row
```

```bash
BASE=https://gsheets-api-....run.app
AUTH='Authorization: Bearer sk_live_...'

curl -H "$AUTH" "$BASE/v1/sheets/expenses/rows?where[status]=active"
# {"tab":"Sheet1","rows":[{"_row":2,"name":"Coffee","status":"active"}, ...]}

curl -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Tea","status":"active"}' "$BASE/v1/sheets/expenses/rows"

curl -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"cancelled"}' "$BASE/v1/sheets/expenses/rows/2"

curl -X DELETE -H "$AUTH" "$BASE/v1/sheets/expenses/rows/2"
```

Rows are addressed by their **actual sheet row number** (`_row` on every read;
row 1 is the header, so data starts at 2). Deleting a row shifts the rows below
it up — that's how spreadsheets work — so re-read before further row-number
writes if you're doing bulk edits.

Errors are consistent JSON: `{"error":{"code":"not_found","message":"..."}}`
with matching HTTP status (401 bad key, 403 op not allowed by the sheet's
`ops`, 404 unknown slug/tab/row, 400 validation — including unknown field
names on writes).

## Development

```bash
npm install
npm test                  # vitest: unit + handler tests, no network
npm run lint && npm run typecheck
API_KEYS=sk_dev_local npm run dev   # http://localhost:8080 (needs gcloud ADC for real sheets)
```

Tests run against an in-memory fake of the Sheets backend. An optional
integration round-trip against a real sheet runs when `INTEGRATION_SHEET_ID`
is set.

## Deployment

`.github/workflows/deploy.yml` tests then deploys to Cloud Run using
Workload Identity Federation — no service-account keys anywhere. One-time GCP
setup (APIs, service accounts, WIF, API-key secret): see
[docs/SETUP.md](docs/SETUP.md).
