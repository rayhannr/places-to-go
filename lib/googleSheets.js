import { google } from 'googleapis'

/**
 * Get an authenticated Google Sheets client.
 */
async function getSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable.')
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  const client = await auth.getClient()
  return google.sheets({ version: 'v4', auth: client })
}

/**
 * Fetch rows from a spreadsheet tab.
 * @param {string} spreadsheetId
 * @param {string} tabName
 */
export async function getRows(spreadsheetId, tabName) {
  const sheets = await getSheetsClient()
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:Z`
  })

  const rows = response.data.values
  if (!rows || rows.length === 0) return []

  const headers = rows[0]
  return rows.slice(1).map(row => {
    const obj = {}
    headers.forEach((header, index) => {
      obj[header] = row[index] || null
    })
    return obj
  })
}

/**
 * Append a row to a spreadsheet tab.
 * @param {string} spreadsheetId
 * @param {string} tabName
 * @param {Array} values
 */
export async function appendRow(spreadsheetId, tabName, values) {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [values]
    }
  })
}
