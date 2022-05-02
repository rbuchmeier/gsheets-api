# GSheet API

Turn your Google Sheet into a data store by using GCP Cloud
Functions as an API.

This project is designed to create a google cloud function
that will serve as an API for any GSheet shared with the service
account that owns the `serviceCredentials.json` file.

## First Time Setup

### Expected Knowledge

- GCP
  - Create a project with an attached billing account
  - Create a service account
  - Enable APIs
- Python virtual environments (for testing)
- Environment variables (for testing)

### Prerequisite Tools

- gcloud CLI
- npm
- poetry (for testing, not necessary for deployment)

### Installation

1. Create a new project in the Google Cloud Platform.
2. Enable the Google Cloud Functions API.
3. Enable the Google Sheets API.
4. Create a service account (with privileges to the Google Sheets API and Google Cloud Functions API).
5. Create a new key for the service account.
6. Download the JSON credentials file and save as `serviceCredentials.json`.
7. Create a new GSheet.
8. Share the GSheet with the service account.
9. Run `npm run initial-deploy` to deploy the function (it is recommended to say No to allowing unauthenticated access).

### Test the API

10. Put your GSheet ID in the `gsheetId` variable.
11. Create a `.envrc` file (see `.envrc.example`).
12. Run `echo $(gcloud auth print-identity-token)` and place output in the `.envrc` file.
13. Run `direnv allow` to set the environment variables in `.envrc`.
14. Run `poetry install`.
15. Change the `URL` variable in `src/main.py` to point to the URL of your new function.
16. Run `poetry run python example_callscript.py` to test the API.

## Development

`npm run start` will start the server for fast local development.

`npm run deploy` will deploy the code to GCP.
