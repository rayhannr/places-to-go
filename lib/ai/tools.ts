import { z } from 'zod'
import { tool } from 'ai'
import { getRows, appendRow, PlaceRow } from '../googleSheets'
import levenshtein from 'fast-levenshtein'
import https from 'https'
import axios from 'axios'

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!
const TAB_NAME = 'Food'
const GMAPS_API_KEY = process.env.GMAPS_API_KEY!
const REFERENCE_LAT = parseFloat(process.env.REFERENCE_LAT!)
const REFERENCE_LNG = parseFloat(process.env.REFERENCE_LNG!)

// --- Types ---

interface Coords {
  lat: number
  lng: number
}

interface DistanceMatrixResult {
  originIndex?: number
  destinationIndex?: number
  distanceMeters?: number
  duration?: string | { seconds: string }
  status?: { code: number }
}

// --- Helper Functions ---

async function resolveShortLink(url: string): Promise<string> {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolveShortLink(res.headers.location).then(resolve)
      } else {
        resolve(res.headers.location || url)
      }
    })
    req.on('error', () => resolve(url))
    req.end()
  })
}

function extractCoords(url: string | null): Coords | null {
  if (!url) return null
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  return null
}

function extractPlaceName(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/maps\/place\/([^\/@]+)/)
  if (!m) return null
  return decodeURIComponent(m[1].replace(/\+/g, ' '))
}

async function coordsFromPlaceName(placeName: string): Promise<Coords | null> {
  try {
    const resp = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: placeName, key: GMAPS_API_KEY },
      timeout: 10000
    })
    const result = resp.data.results?.[0]
    if (result) {
      const { lat, lng } = result.geometry.location
      return { lat, lng }
    }
  } catch (err) {}
  return null
}

async function getDistancesBatch(origin: Coords, destinations: Coords[]): Promise<DistanceMatrixResult[]> {
  const url = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
  const body = {
    origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
    destinations: destinations.map(({ lat, lng }) => ({
      waypoint: { location: { latLng: { latitude: lat, longitude: lng } } }
    })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE'
  }
  const resp = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GMAPS_API_KEY,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,status'
    },
    timeout: 30000
  })
  return Array.isArray(resp.data) ? resp.data : []
}

function parseDurationSecs(duration: string | { seconds: string } | undefined): number | null {
  if (!duration) return null
  if (typeof duration === 'string') {
    const m = duration.match(/(\d+)s/)
    return m ? parseInt(m[1]) : null
  }
  if (typeof duration === 'object') {
    return duration.seconds ? parseInt(duration.seconds) : null
  }
  return null
}

// --- Helper Functions for Tool Outputs ---

function compactPlace(r: PlaceRow) {
  return {
    name: r.Name || r.name,
    city: r.City || r.city,
    dist: r['Distance (km)'] || r.distKm,
    time: r['Travel Time (min)'] || r.travelMin,
    visited: r['Date Visited'] || null
  }
}

function filterByStatus(rows: PlaceRow[], status: 'visited' | 'unvisited') {
  return rows.filter(r => (status === 'visited' ? !!r['Date Visited'] : !r['Date Visited']))
}

// --- Tool Definitions ---

export const tools = {
  get_random_places: tool({
    description: 'Get a list of random places from the tracker. Great for "surprise me" moments.',
    parameters: z.object({
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited')
    }),
    execute: async ({ count = 1, status = 'unvisited' }: { count?: number; status?: 'visited' | 'unvisited' }) => {
      const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const filtered = filterByStatus(allRows, status)
      const shuffled = [...filtered].sort(() => 0.5 - Math.random())
      return shuffled.slice(0, Math.min(count, 10)).map(compactPlace)
    }
  }),
  get_nearby_places: tool({
    description: 'Get the closest places based on distance.',
    parameters: z.object({
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited')
    }),
    execute: async ({ count = 1, status = 'unvisited' }: { count?: number; status?: 'visited' | 'unvisited' }) => {
      const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const filtered = filterByStatus(allRows, status)
      const sorted = [...filtered].sort((a, b) => {
        const distA = parseFloat((a['Distance (km)'] || a.distKm || Infinity).toString())
        const distB = parseFloat((b['Distance (km)'] || b.distKm || Infinity).toString())
        return distA - distB
      })
      return sorted.slice(0, Math.min(count, 10)).map(compactPlace)
    }
  }),
  get_quickest_places: tool({
    description: 'Get places with the shortest travel time.',
    parameters: z.object({
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited')
    }),
    execute: async ({ count = 1, status = 'unvisited' }: { count?: number; status?: 'visited' | 'unvisited' }) => {
      const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const filtered = filterByStatus(allRows, status)
      const sorted = [...filtered].sort((a, b) => {
        const timeA = parseFloat((a['Travel Time (min)'] || a.travelMin || Infinity).toString())
        const timeB = parseFloat((b['Travel Time (min)'] || b.travelMin || Infinity).toString())
        return timeA - timeB
      })
      return sorted.slice(0, Math.min(count, 10)).map(compactPlace)
    }
  }),
  get_places_by_city: tool({
    description: 'Get places filtered by a specific city.',
    parameters: z.object({
      city: z.string().describe('The name of the city to filter by'),
      count: z.number().optional().default(3).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited')
    }),
    execute: async ({ city, count = 3, status = 'unvisited' }: { city: string; count?: number; status?: 'visited' | 'unvisited' }) => {
      const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const filtered = filterByStatus(allRows, status).filter(r => {
        const rowCity = (r.City || r.city || '').toLowerCase()
        return rowCity.includes(city.toLowerCase())
      })
      return filtered.slice(0, Math.min(count, 10)).map(compactPlace)
    }
  }),
  search_places_by_name: tool({
    description: 'Search for a place by its name using fuzzy matching.',
    parameters: z.object({
      query: z.string().describe('The name of the place to search for'),
      count: z.number().optional().default(1).describe('Number of results to return (1-10)'),
      status: z.enum(['visited', 'unvisited', 'any']).optional().default('any')
    }),
    execute: async ({ query, count = 1, status = 'any' }: { query: string; count?: number; status?: 'visited' | 'unvisited' | 'any' }) => {
      const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const filtered = status === 'any' ? allRows : filterByStatus(allRows, status as any)

      const results = filtered
        .map(r => {
          const name = (r.Name || r.name || '').toLowerCase()
          const distance = levenshtein.get(name, query.toLowerCase())
          const isPartial = name.includes(query.toLowerCase())
          return { row: r, score: isPartial ? 0 : distance }
        })
        .sort((a, b) => a.score - b.score)

      return results.slice(0, Math.min(count, 10)).map(res => compactPlace(res.row))
    }
  }),
  add_place: tool({
    description:
      'Adds a new place to the tracker using a name, city, and Google Maps link. It will automatically calculate distance and travel time.',
    parameters: z.object({
      name: z.string().describe('Name of the place'),
      city: z.string().describe('City where the place is located'),
      link: z.string().describe('Google Maps URL (supports short links)')
    }),
    execute: async ({ name, city, link }: { name: string; city: string; link: string }) => {
      const fullUrl = await resolveShortLink(link)
      let c = extractCoords(fullUrl)

      if (!c) {
        const placeName = extractPlaceName(fullUrl)
        if (placeName) {
          c = await coordsFromPlaceName(placeName)
        }
      }

      let distKm: number | null = null
      let travelMin: number | null = null

      if (c) {
        const origin = { lat: REFERENCE_LAT, lng: REFERENCE_LNG }
        const apiResults = await getDistancesBatch(origin, [c])
        const res = apiResults[0]
        if (res && (!res.status || res.status.code === 0)) {
          distKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null
          const secs = parseDurationSecs(res.duration)
          travelMin = secs ? +(secs / 60).toFixed(1) : null
        }
      }

      const row = [name, city, link, distKm!, travelMin!, '']
      await appendRow(SPREADSHEET_ID, TAB_NAME, row)

      return { success: true, entry: { name, city, distKm, travelMin } }
    }
  })
}
