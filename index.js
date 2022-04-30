const {google} = require('googleapis');

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    keyFile: 'serviceCredentials.json',
  });
  const client = await auth.getClient();
  return google.sheets({version: 'v4', auth: client});
}

exports.main = async (req, res) => {
  console.log("Entered Function");
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": 2592000, // 30 days
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    console.log("Returning 204");
    return;
  }
  console.log("Writing response");
  res.writeHead(200, headers);
  res.end(JSON.stringify({status: 200, message: "Successfully updated spreadsheet"}));
};

async function write_row_to_gsheet(row, gsheet_id) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: gsheet_id,
    range: 'Sheet1!A:B',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [
        row
      ]
    }
  })
}