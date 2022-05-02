const {google} = require('googleapis');

async function _getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    keyFile: 'serviceCredentials.json',
  });
  const client = await auth.getClient();
  return google.sheets({version: 'v4', auth: client});
}

async function getGSheet(gSheetId) {
  const sheets = await _getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: gSheetId,
    includeGridData: true,
  });
  return response.data;
}

function getTitle(gSheet) {
  return gSheet.properties.title;
}

function getData(gSheet) {
  return gSheet.sheets.map(sheet => sheet.data[0].rowData);
}

async function appendGSheet(gSheetId, data, sheetName=null) {
  const sheets = await _getSheetsClient();
  let tableRange = sheetName ? `${sheetName}!A1` : 'A1';
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: gSheetId,
    range: tableRange,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [ data ],
    },
  });
  return response.data;
}

module.exports = { getGSheet, getTitle, getData, appendGSheet };