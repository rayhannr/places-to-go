import { put, head } from '@vercel/blob'
import axios from 'axios'
import type { PlaceRow } from './types'

const BLOB_PATHNAME = 'demo/places-data.json'

interface DemoData {
  places: PlaceRow[]
}

async function readData(): Promise<DemoData> {
  try {
    const blob = await head(BLOB_PATHNAME)
    const res = await axios.get<DemoData>(blob.url, { headers: { 'Cache-Control': 'no-store' } })
    return res.data
  } catch {
    return { places: [] }
  }
}

async function writeData(data: DemoData): Promise<void> {
  await put(BLOB_PATHNAME, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json'
  })
}

export async function demoGetRows(_spreadsheetId: string, _tabName: string): Promise<PlaceRow[]> {
  const data = await readData()
  return data.places
}

export async function demoAppendRow(
  _spreadsheetId: string,
  _tabName: string,
  values: (string | number | null)[]
): Promise<void> {
  const data = await readData()
  const row: PlaceRow = {
    Name: (values[0] as string) || '',
    City: (values[1] as string) || '',
    Link: (values[2] as string) || '',
    'Distance (km)': values[3] ?? null,
    'Travel Time (min)': values[4] ?? null,
    'Date Visited': (values[5] as string) || null,
    'Distance (from current location)': values[6] ?? null,
    'Travel Time (from current location)': values[7] ?? null
  }
  data.places.push(row)
  await writeData(data)
}

export async function demoUpdateLiveDistances(
  _spreadsheetId: string,
  _tabName: string,
  values: (string | number | null)[][]
): Promise<void> {
  const data = await readData()
  values.forEach((pair, i) => {
    if (data.places[i]) {
      data.places[i]['Distance (from current location)'] = pair[0] ?? null
      data.places[i]['Travel Time (from current location)'] = pair[1] ?? null
    }
  })
  await writeData(data)
}

export async function demoUpdateSheetLinks(
  _spreadsheetId: string,
  _tabName: string,
  values: (string | null)[][]
): Promise<void> {
  const data = await readData()
  values.forEach((pair, i) => {
    if (data.places[i]) {
      data.places[i].Link = pair[0] || ''
    }
  })
  await writeData(data)
}

export async function demoUpdateVisitDate(
  _spreadsheetId: string,
  _tabName: string,
  rowIndex: number, // 1-based sheet row; data starts at row 2, so array index = rowIndex - 2
  date: string
): Promise<void> {
  const data = await readData()
  const arrayIndex = rowIndex - 2
  if (data.places[arrayIndex]) {
    data.places[arrayIndex]['Date Visited'] = date || null
  }
  await writeData(data)
}

export async function demoDeleteRow(
  _spreadsheetId: string,
  _tabName: string,
  rowIndex: number // 1-based sheet row; array index = rowIndex - 2
): Promise<void> {
  const data = await readData()
  const arrayIndex = rowIndex - 2
  data.places.splice(arrayIndex, 1)
  await writeData(data)
}

export async function demoGetChatSession(_userId: string): Promise<{
  lat: number | null
  lng: number | null
  history: any[]
}> {
  return { lat: null, lng: null, history: [] }
}

export async function demoSaveChatSession(
  _userId: string,
  _update: { lat?: number | null; lng?: number | null; history?: any[] }
): Promise<void> {}

