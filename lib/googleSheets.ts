import { google, sheets_v4 } from 'googleapis'

export interface PlaceRow {
  Name: string
  City: string
  Link: string
  'Distance (km)': string | number | null
  'Travel Time (min)': string | number | null
  'Date Visited': string | null
  'Distance (from current location)': string | number | null
  'Travel Time (from current location)': string | number | null
  // Support for lowercase keys if they exist in legacy code
  name?: string
  city?: string
  link?: string
  distKm?: string | number
  travelMin?: string | number
  lat?: number
  lng?: number
}

interface CacheEntry {
  rows: PlaceRow[]
  expiresAt: number
}

// ─── In-memory cache ─────────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, CacheEntry>()

/**
 * Get an authenticated Google Sheets client.
 */
async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable.')
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  const client = await auth.getClient()
  return google.sheets({ version: 'v4', auth: client as any })
}

/**
 * Fetch rows from a spreadsheet tab.
 */
export async function getRows(spreadsheetId: string, tabName: string): Promise<PlaceRow[]> {
  const key = `${spreadsheetId}::${tabName}`
  const cached = cache.get(key)

  if (cached && Date.now() < cached.expiresAt) {
    return cached.rows
  }

  const sheets = await getSheetsClient()
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:Z`
  })

  const rows = response.data.values
  if (!rows || rows.length === 0) return []

  const headers = rows[0] as string[]
  const parsed: PlaceRow[] = rows.slice(1).map(row => {
    const obj: any = {}
    headers.forEach((header, index) => {
      obj[header] = row[index] || null
    })
    return obj as PlaceRow
  })

  cache.set(key, { rows: parsed, expiresAt: Date.now() + TTL_MS })
  return parsed
}

/**
 * Append a row to a spreadsheet tab.
 */
export async function appendRow(spreadsheetId: string, tabName: string, values: (string | number | null)[]): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values]
    }
  } as any)

  // Invalidate cache
  const key = `${spreadsheetId}::${tabName}`
  cache.delete(key)
}

/**
 * Batch update the "Live" location columns (G and H: Distance and Travel Time from current location).
 */
export async function updateLiveDistances(
  spreadsheetId: string,
  tabName: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = await getSheetsClient()
  
  // Update G2:H{1+values.length}
  const range = `${tabName}!G2:H${1 + values.length}`
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values
    }
  } as any)

  // Invalidate cache
  const key = `${spreadsheetId}::${tabName}`
  cache.delete(key)
}

/**
 * Persist user location to a 'Session' tab.
 */
export async function setUserLocation(userId: string, coords: { lat: number; lng: number }): Promise<void> {
  const sheets = await getSheetsClient()
  const spreadsheetId = process.env.SPREADSHEET_ID!
  const tabName = 'Session'

  // Get current session data to find the right row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:C`
  })

  const rows = (response.data.values || []) as any[][]
  const userIdx = rows.findIndex(row => row[0] === userId)

  if (userIdx !== -1) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A${userIdx + 1}:C${userIdx + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[userId, coords.lat, coords.lng]]
      }
    } as any)
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[userId, coords.lat, coords.lng]]
      }
    } as any)
  }
}

/**
 * Retrieve user location from 'Session' tab.
 */
export async function getUserLocation(userId: string): Promise<{ lat: number; lng: number } | null> {
  const sheets = await getSheetsClient()
  const spreadsheetId = process.env.SPREADSHEET_ID!
  const tabName = 'Session'

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:C`
  }).catch(() => ({ data: { values: [] } }))

  const rows = (response.data.values || []) as any[][]
  const userRow = rows.find(row => row[0] === userId)

  if (userRow) {
    return {
      lat: parseFloat(userRow[1]),
      lng: parseFloat(userRow[2])
    }
  }

  return null
}
