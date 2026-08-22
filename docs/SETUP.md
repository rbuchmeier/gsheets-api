# One-time GCP setup

Everything here is done once. After this, registering a sheet is just: share it
with the runtime service account, add an entry to `sheets.config.ts`, push.

Set these shell variables first (adjust to taste):

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export REPO="rbuchmeier/gsheets-api"
gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
```

## 1. Enable APIs

```bash
gcloud services enable \
  sheets.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com
```

## 2. Runtime service account (the one sheets get shared with)

```bash
gcloud iam service-accounts create gsheets-api-runtime \
  --display-name="gsheets-api runtime"
```

Its email is `gsheets-api-runtime@$PROJECT_ID.iam.gserviceaccount.com` — this is
the address you share Google Sheets with. It needs **no project-level roles** for
Sheets access; sharing the sheet is the grant. No JSON keys are ever created.

## 3. API keys secret

Generate one or more keys (comma-separated) and store them in Secret Manager:

```bash
openssl rand -hex 24 | sed 's/^/sk_live_/' | tr -d '\n' | \
  gcloud secrets create gsheets-api-keys --data-file=-

# Let the runtime SA read it:
gcloud secrets add-iam-policy-binding gsheets-api-keys \
  --member="serviceAccount:gsheets-api-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

To rotate/add keys later: `gcloud secrets versions add gsheets-api-keys --data-file=-`
(the value is the full comma-separated list).

## 4. Deploy service account + Workload Identity Federation

GitHub Actions authenticates keylessly via OIDC:

```bash
gcloud iam service-accounts create gsheets-api-deployer \
  --display-name="gsheets-api GitHub deployer"

# Roles needed to run a source deploy to Cloud Run:
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.admin \
            roles/storage.admin roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:gsheets-api-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role" --condition=None
done

# WIF pool + GitHub OIDC provider, restricted to this repo:
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --location=global --workload-identity-pool=github \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"

# Allow the repo's workflows to impersonate the deployer:
gcloud iam service-accounts add-iam-policy-binding \
  "gsheets-api-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

## 5. GitHub Actions variables

```bash
gh variable set GCP_PROJECT_ID --repo "$REPO" --body "$PROJECT_ID"
gh variable set GCP_REGION --repo "$REPO" --body "$REGION"
gh variable set GCP_RUNTIME_SA --repo "$REPO" \
  --body "gsheets-api-runtime@$PROJECT_ID.iam.gserviceaccount.com"
gh variable set GCP_DEPLOY_SA --repo "$REPO" \
  --body "gsheets-api-deployer@$PROJECT_ID.iam.gserviceaccount.com"
gh variable set GCP_WIF_PROVIDER --repo "$REPO" \
  --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-oidc"
```

The deploy job in `.github/workflows/deploy.yml` skips itself until
`GCP_PROJECT_ID` is set, so CI is green before this setup is done.

## 6. First deploy

Push to `main` (or re-run the Deploy workflow). The service URL is printed in
the workflow output, or:

```bash
gcloud run services describe gsheets-api --region "$REGION" --format='value(status.url)'
```

## Local development

```bash
# Sheets access uses your own Google account via Application Default Credentials:
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform

API_KEYS=sk_dev_local npm run dev
curl -H "Authorization: Bearer sk_dev_local" http://localhost:8080/v1/sheets
```

## Optional: integration test against a real sheet

Create a throwaway sheet with headers `name | status` in row 1, share it with
your ADC account (or the runtime SA), then:

```bash
INTEGRATION_SHEET_ID=<sheet-id> npm test
```
