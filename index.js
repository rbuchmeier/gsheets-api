const { getGSheet, getData, getTitle, appendGSheet } = require('./gsheet');
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": 2592000, // 30 days
};

function handleCors(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, HEADERS);
    res.end();
    console.log("Returning 204");
  }
}

function handleResponse(res, data, statusCode) {
  res.writeHead(statusCode, HEADERS);
  res.end(JSON.stringify(data));
}

exports.main = async (req, res) => {
  handleCors(req, res);

  if (req.method === "POST") {
    await _post(req, res);
  } else if (req.method === "GET") {
    await _get(req, res);
  }
};

async function _get(req, res) {
  let gSheetId = req.query["gsheetid"];
  let gSheet = await getGSheet(gSheetId);
  let data = await getData(gSheet);
  handleResponse(res, data, 200);
}

async function _post(req, res) {
  let gSheetId = req.body["gsheetid"];
  let data = req.body["data"];
  let sheetName = req.body["sheetname"];
  let response = await appendGSheet(gSheetId, data, sheetName);
  handleResponse(res, response, 200);
}
