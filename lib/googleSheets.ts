import { google, sheets_v4 } from 'googleapis'
import {
  demoGetRows,
  demoAppendRow,
  demoUpdateLiveDistances,
  demoUpdateSheetLinks,
  demoGetChatSession,
  demoSaveChatSession,
  demoUpdateVisitDate,
  demoDeleteRow,
  demoUpdatePriorities,
  demoUpdatePlaceFields
} from './demo-store'
import { getRedis } from './redis'
export type { PlaceRow } from './types'

const DEMO_MODE = process.env.DEMO_MODE === 'true'

import type { PlaceRow } from './types'

// ─── Constants ───────────────────────────────────────────────────────────────
const ROWS_CACHE_TTL_SECS = 5 * 60 // 5 minutes for the Redis-backed row cache
const ROWS_CACHE_PREFIX = 'ptg:sheets:rows:'
const SESSION_TTL = 60 * 60 * 1000 // 1 hour for chat history session

/**
 * Row cache backed by Upstash Redis, shared across all serverless instances.
 * No-ops (always a cache miss) if Upstash env vars are absent, e.g. local dev.
 */
async function getCachedRows(key: string): Promise<PlaceRow[] | null> {
  const redis = getRedis()
  if (!redis) return null
  return redis.get<PlaceRow[]>(`${ROWS_CACHE_PREFIX}${key}`)
}

async function setCachedRows(key: string, rows: PlaceRow[]): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.set(`${ROWS_CACHE_PREFIX}${key}`, rows, { ex: ROWS_CACHE_TTL_SECS })
}

async function invalidateRowsCache(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.del(`${ROWS_CACHE_PREFIX}${key}`)
}

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
  if (DEMO_MODE) return demoGetRows(spreadsheetId, tabName)

  const key = `${spreadsheetId}::${tabName}`
  const cached = await getCachedRows(key)
  if (cached) return cached

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

  await setCachedRows(key, parsed)
  return parsed
}

/**
 * Append a row to a spreadsheet tab.
 */
export async function appendRow(spreadsheetId: string, tabName: string, values: (string | number | null)[]): Promise<void> {
  if (DEMO_MODE) return demoAppendRow(spreadsheetId, tabName, values)

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
  await invalidateRowsCache(key)
}

/**
 * Batch update the "Live" location columns (G and H: Distance and Travel Time from current location).
 */
export async function updateLiveDistances(
  spreadsheetId: string,
  tabName: string,
  values: (string | number | null)[][]
): Promise<void> {
  if (DEMO_MODE) return demoUpdateLiveDistances(spreadsheetId, tabName, values)

  const sheets = await getSheetsClient()
  const range = `${tabName}!G2:H${1 + values.length}`
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values
    }
  } as any)

  const key = `${spreadsheetId}::${tabName}`
  await invalidateRowsCache(key)
}

/**
 * Batch update the Link column (Column C).
 */
export async function updateSheetLinks(
  spreadsheetId: string,
  tabName: string,
  values: (string | null)[][]
): Promise<void> {
  if (DEMO_MODE) return demoUpdateSheetLinks(spreadsheetId, tabName, values)

  const sheets = await getSheetsClient()
  const range = `${tabName}!C2:C${1 + values.length}`
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values
    }
  } as any)

  const key = `${spreadsheetId}::${tabName}`
  await invalidateRowsCache(key)
}

/**
 * Get the full session data (location + chat history) for a user.
 */
export async function getChatSession(userId: string): Promise<{
  lat: number | null
  lng: number | null
  history: any[]
}> {
  if (DEMO_MODE) return demoGetChatSession(userId)

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
  if (DEMO_MODE) return demoSaveChatSession(userId, data)

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

/**
 * Update the "Date Visited" column (Column F) for a specific row.
 */
export async function updateVisitDate(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  date: string
): Promise<void> {
  if (DEMO_MODE) return demoUpdateVisitDate(spreadsheetId, tabName, rowIndex, date)

  const sheets = await getSheetsClient()
  const range = `${tabName}!F${rowIndex}`
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[date]]
    }
  } as any)

  const key = `${spreadsheetId}::${tabName}`
  await invalidateRowsCache(key)
}

/**
 * Batch update the "Priority" column (Column I) for a scattered set of rows.
 * Pass an empty string as priority to clear a cell.
 */
export async function updatePriorities(
  spreadsheetId: string,
  tabName: string,
  updates: { rowIndex: number; priority: number | string }[]
): Promise<void> {
  if (DEMO_MODE) return demoUpdatePriorities(spreadsheetId, tabName, updates)
  if (updates.length === 0) return

  const sheets = await getSheetsClient()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates.map(u => ({
        range: `${tabName}!I${u.rowIndex}`,
        values: [[u.priority]]
      }))
    }
  } as any)

  const key = `${spreadsheetId}::${tabName}`
  await invalidateRowsCache(key)
}

/**
 * Update one or more of the editable metadata fields (Name, City, Link, Category —
 * columns A, B, C, J) for a specific row. Only the provided fields are written.
 */
export async function updatePlaceFields(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  fields: { name?: string; city?: string; link?: string; category?: string }
): Promise<void> {
  if (DEMO_MODE) return demoUpdatePlaceFields(spreadsheetId, tabName, rowIndex, fields)

  const columnByField: Record<keyof typeof fields, string> = { name: 'A', city: 'B', link: 'C', category: 'J' }
  const data = (Object.keys(fields) as (keyof typeof fields)[])
    .filter(field => fields[field] !== undefined)
    .map(field => ({
      range: `${tabName}!${columnByField[field]}${rowIndex}`,
      values: [[fields[field]]]
    }))

  if (data.length === 0) return

  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data
    }
  } as any)

  const key = `${spreadsheetId}::${tabName}`
  await invalidateRowsCache(key)
}

/**
 * Delete a specific row by its 1-based index (e.g. index 2 is the first data row).
 */
export async function deleteRow(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number
): Promise<void> {
  if (DEMO_MODE) return demoDeleteRow(spreadsheetId, tabName, rowIndex)

  const sheets = await getSheetsClient()
  
  // Find the sheetId for the given tabName
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
  })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === tabName)
  const sheetId = sheet?.properties?.sheetId
  
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Tab "${tabName}" not found in spreadsheet.`)
  }

  // Deleting row requires 0-based indexing.
  // Since rowIndex is 1-based, the startIndex (0-based) is rowIndex - 1.
  // The endIndex is startIndex + 1, which is rowIndex.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }
      ]
    }
  })

  // Invalidate cache
  const key = `${spreadsheetId}::${tabName}`
  await invalidateRowsCache(key)
}

