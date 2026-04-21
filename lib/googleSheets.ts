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

// ─── Constants ───────────────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000 // 5 minutes for in-memory row cache
const SESSION_TTL = 60 * 60 * 1000 // 1 hour for chat history session
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
 * Get the full session data (location + chat history) for a user.
 */
export async function getChatSession(userId: string): Promise<{
  lat: number | null
  lng: number | null
  history: any[]
}> {
  const sheets = await getSheetsClient()
  const spreadsheetId = process.env.SPREADSHEET_ID!
  const tabName = 'Session'

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:E`
  }).catch(() => ({ data: { values: [] } }))

  const rows = (response.data.values || []) as any[][]
  const userRow = rows.find(row => row[0] === userId)

  if (userRow) {
    let history = []
    const lastActivity = userRow[4] ? parseInt(userRow[4]) : 0
    const isExpired = Date.now() - lastActivity > SESSION_TTL

    if (!isExpired) {
      try {
        history = userRow[3] ? JSON.parse(userRow[3]) : []
      } catch (e) {
        console.error('Error parsing chat history:', e)
      }
    }

    return {
      lat: userRow[1] ? parseFloat(userRow[1]) : null,
      lng: userRow[2] ? parseFloat(userRow[2]) : null,
      history
    }
  }

  return { lat: null, lng: null, history: [] }
}

/**
 * Persist user session (location and/or chat history) to the 'Session' tab.
 */
export async function saveChatSession(
  userId: string, 
  data: { lat?: number | null; lng?: number | null; history?: any[] }
): Promise<void> {
  const sheets = await getSheetsClient()
  const spreadsheetId = process.env.SPREADSHEET_ID!
  const tabName = 'Session'

  // Get current session data to find the right row and preserve existing data
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:E`
  })

  const rows = (response.data.values || []) as any[][]
  const userIdx = rows.findIndex(row => row[0] === userId)

  const existing = userIdx !== -1 ? rows[userIdx] : [userId, null, null, '[]', '0']
  
  const finalLat = data.lat !== undefined ? data.lat : existing[1]
  const finalLng = data.lng !== undefined ? data.lng : existing[2]
  const finalHistory = data.history !== undefined ? JSON.stringify(data.history) : existing[3]
  const finalTimestamp = data.history !== undefined ? Date.now().toString() : existing[4]

  const newValues = [userId, finalLat, finalLng, finalHistory, finalTimestamp]

  if (userIdx !== -1) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A${userIdx + 1}:E${userIdx + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [newValues]
      }
    } as any)
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [newValues]
      }
    } as any)
  }
}

