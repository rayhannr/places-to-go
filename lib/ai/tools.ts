import https from 'https'
import { Client, AddressType } from '@googlemaps/google-maps-services-js'
import { tool } from 'ai'
import axios from 'axios'
import levenshtein from 'fast-levenshtein'
import { z } from 'zod'
import { getRows, appendRow, PlaceRow, updateLiveDistances, setUserLocation } from '../googleSheets'

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!
const TAB_NAME = 'Food'
const GMAPS_API_KEY = process.env.GMAPS_API_KEY!
const REFERENCE_LAT = parseFloat(process.env.REFERENCE_LAT!)
const REFERENCE_LNG = parseFloat(process.env.REFERENCE_LNG!)

const gmapsClient = new Client({})

/**
 * Calculates the straight-line distance between two points in km.
 * Used for the "3km rule" check to avoid unnecessary API calls.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

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
    const resp = await gmapsClient.geocode({
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

async function cityFromCoords(coords: Coords): Promise<string | null> {
  try {
    const resp = await gmapsClient.reverseGeocode({
      params: { latlng: coords, key: GMAPS_API_KEY },
      timeout: 10000
    })
    const result = resp.data.results?.[0]
    if (result && result.address_components) {
      // Look for locality (City) or administrative_area_level_2 (Regency/District)
      const isCity = (c: { types: string[] }) =>
        c.types.includes(AddressType.locality) || c.types.includes(AddressType.administrative_area_level_2)
      const cityComp = result.address_components.find(isCity)
      if (cityComp) return cityComp.long_name
    }
  } catch (err) {}
  return null
}

async function getDistancesBatch(origin: Coords, destinations: Coords[]): Promise<DistanceMatrixResult[]> {
  const url = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
  const CHUNK_SIZE = 600 // Google limit is 625 elements (origins * destinations)
  let allResults: DistanceMatrixResult[] = []

  for (let i = 0; i < destinations.length; i += CHUNK_SIZE) {
    const chunk = destinations.slice(i, i + CHUNK_SIZE)
    const body = {
      origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
      destinations: chunk.map(({ lat, lng }) => ({
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

    if (Array.isArray(resp.data)) {
      // Adjust destinationIndex for chunking
      const adjusted = resp.data.map(r => ({
        ...r,
        destinationIndex: r.destinationIndex !== undefined ? r.destinationIndex + i : undefined
      }))
      allResults = allResults.concat(adjusted)
    }
  }

  return allResults.sort((a, b) => (a.destinationIndex || 0) - (b.destinationIndex || 0))
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

function compactPlace(r: PlaceRow, useLive = false) {
  const dist = useLive ? r['Distance (from current location)'] || r['Distance (km)'] || r.distKm : r['Distance (km)'] || r.distKm
  const time = useLive
    ? r['Travel Time (from current location)'] || r['Travel Time (min)'] || r.travelMin
    : r['Travel Time (min)'] || r.travelMin

  return {
    name: r.Name || r.name,
    city: r.City || r.city,
    link: r.Link || r.link,
    dist,
    time,
    visited: r['Date Visited'] || null
  }
}

async function syncLiveDistancesIfNeeded(rows: PlaceRow[], userLocation: Coords | undefined): Promise<PlaceRow[]> {
  if (!userLocation) return rows
  if (rows.length === 0) return rows

  const firstRow = rows[0]
  const storedDist = firstRow['Distance (from current location)']
  const firstCoords = extractCoords(firstRow.Link)

  // 1. Check if "current location" columns are empty
  const needsInitialization = storedDist === null || storedDist === undefined || storedDist === ''

  let shouldUpdate = needsInitialization

  if (!needsInitialization && firstCoords) {
    // 2. The 3km Rule Check
    // Calculate current real distance vs what's in the sheet for the first item
    const currentRealDist = haversineDistance(userLocation.lat, userLocation.lng, firstCoords.lat, firstCoords.lng)
    const diff = Math.abs(currentRealDist - parseFloat(storedDist.toString()))

    if (diff > 2) {
      shouldUpdate = true
    }
  }

  if (shouldUpdate) {
    console.log('Recalculating distances for all rows...')
    const destinationCoords = rows.map(r => extractCoords(r.Link)).filter((c): c is Coords => !!c)

    // We need to keep track of which rows actually had coords
    const rowsWithCoords = rows.filter(r => !!extractCoords(r.Link))

    const results = await getDistancesBatch(userLocation, destinationCoords)

    const updateValues: (string | number | null)[][] = rows.map(() => [null, null])

    results.forEach(res => {
      if (res.destinationIndex !== undefined && (!res.status || res.status.code === 0)) {
        const distKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null
        const secs = parseDurationSecs(res.duration)
        const travelMin = secs ? +(secs / 60).toFixed(1) : null

        const rowIndex = rows.indexOf(rowsWithCoords[res.destinationIndex])
        if (rowIndex !== -1) {
          updateValues[rowIndex] = [distKm, travelMin]
          // Update the in-memory rows for immediate return
          rows[rowIndex]['Distance (from current location)'] = distKm
          rows[rowIndex]['Travel Time (from current location)'] = travelMin
        }
      }
    })

    // Batch update the sheet (Columns G and H)
    await updateLiveDistances(SPREADSHEET_ID, TAB_NAME, updateValues)
  }

  return rows
}

function filterByStatus(rows: PlaceRow[], status: 'visited' | 'unvisited') {
  return rows.filter(r => (status === 'visited' ? !!r['Date Visited'] : !r['Date Visited']))
}

// --- Tool Definitions ---

export const tools = {
  get_random_places: tool({
    description: 'Get a list of random places from the tracker. Great for "surprise me" moments.',
    inputSchema: z.object({
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited'),
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
    }),
    execute: async ({
      count = 1,
      status = 'unvisited',
      userLocation
    }: {
      count?: number
      status?: 'visited' | 'unvisited'
      userLocation?: Coords
    }) => {
      let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      if (userLocation) {
        allRows = await syncLiveDistancesIfNeeded(allRows, userLocation)
      }
      const filtered = filterByStatus(allRows, status)
      const shuffled = [...filtered].sort(() => 0.5 - Math.random())
      return shuffled.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
    }
  }),
  get_nearby_places: tool({
    description: 'Get the closest places based on distance.',
    inputSchema: z.object({
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited'),
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
    }),
    execute: async ({
      count = 1,
      status = 'unvisited',
      userLocation
    }: {
      count?: number
      status?: 'visited' | 'unvisited'
      userLocation?: Coords
    }) => {
      let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      if (userLocation) {
        allRows = await syncLiveDistancesIfNeeded(allRows, userLocation)
      }
      const filtered = filterByStatus(allRows, status)
      const sorted = [...filtered].sort((a, b) => {
        const distA = parseFloat(
          (userLocation ? a['Distance (from current location)'] : a['Distance (km)'] || a.distKm) || (Infinity as any)
        )
        const distB = parseFloat(
          (userLocation ? b['Distance (from current location)'] : b['Distance (km)'] || b.distKm) || (Infinity as any)
        )
        return distA - distB
      })
      return sorted.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
    }
  }),
  get_quickest_places: tool({
    description: 'Get places with the shortest travel time.',
    inputSchema: z.object({
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited'),
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
    }),
    execute: async ({
      count = 1,
      status = 'unvisited',
      userLocation
    }: {
      count?: number
      status?: 'visited' | 'unvisited'
      userLocation?: Coords
    }) => {
      let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      if (userLocation) {
        allRows = await syncLiveDistancesIfNeeded(allRows, userLocation)
      }
      const filtered = filterByStatus(allRows, status)
      const sorted = [...filtered].sort((a, b) => {
        const timeA = parseFloat(
          (userLocation ? a['Distance (from current location)'] : a['Travel Time (min)'] || a.travelMin) || (Infinity as any)
        )
        const timeB = parseFloat(
          (userLocation ? b['Distance (from current location)'] : b['Travel Time (min)'] || b.travelMin) || (Infinity as any)
        )
        return timeA - timeB
      })
      return sorted.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
    }
  }),
  get_places_by_city: tool({
    description: 'Get places filtered by a specific city.',
    inputSchema: z.object({
      city: z.string().describe('The name of the city to filter by'),
      count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
      status: z.enum(['visited', 'unvisited']).optional().default('unvisited'),
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
    }),
    execute: async ({
      city,
      count = 1,
      status = 'unvisited',
      userLocation
    }: {
      city: string
      count?: number
      status?: 'visited' | 'unvisited'
      userLocation?: Coords
    }) => {
      let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      if (userLocation) {
        allRows = await syncLiveDistancesIfNeeded(allRows, userLocation)
      }
      const filtered = filterByStatus(allRows, status).filter(r => {
        const rowCity = (r.City || r.city || '').toLowerCase()
        return rowCity.includes(city.toLowerCase())
      })
      return filtered.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
    }
  }),
  search_places_by_name: tool({
    description: 'Search for a place by its name using fuzzy matching.',
    inputSchema: z.object({
      query: z.string().describe('The name of the place to search for'),
      count: z.number().optional().default(1).describe('Number of results to return (1-10)'),
      status: z.enum(['visited', 'unvisited', 'any']).optional().default('any'),
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
    }),
    execute: async ({
      query,
      count = 1,
      status = 'any',
      userLocation
    }: {
      query: string
      count?: number
      status?: 'visited' | 'unvisited' | 'any'
      userLocation?: Coords
    }) => {
      let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      if (userLocation) {
        allRows = await syncLiveDistancesIfNeeded(allRows, userLocation)
      }
      const filtered = status === 'any' ? allRows : filterByStatus(allRows, status as any)

      const results = filtered
        .map(r => {
          const name = (r.Name || r.name || '').toLowerCase()
          const distance = levenshtein.get(name, query.toLowerCase())
          const isPartial = name.includes(query.toLowerCase())
          return { row: r, score: isPartial ? 0 : distance }
        })
        .sort((a, b) => a.score - b.score)

      return results.slice(0, Math.min(count, 10)).map(res => compactPlace(res.row, !!userLocation))
    }
  }),
  add_place: tool({
    description:
      'Adds a new place to the tracker using a Google Maps link. You only need to provide the link. The name and city will be automatically derived from the link if not explicitly provided.',
    inputSchema: z.object({
      name: z.string().optional().describe('Name of the place (Optional, will be automatically extracted from link)'),
      city: z.string().optional().describe('City where the place is located (Optional, will be derived via geocoding)'),
      link: z.string().describe('Google Maps URL (supports short links)'),
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
    }),
    execute: async ({ name, city, link, userLocation }: { name?: string; city?: string; link: string; userLocation?: Coords }) => {
      const fullUrl = await resolveShortLink(link)
      let c = extractCoords(fullUrl)

      let finalName = name || extractPlaceName(fullUrl)

      if (!c) {
        if (finalName) {
          c = await coordsFromPlaceName(finalName)
        }
      }

      let finalCity = city
      if (!finalCity && c) {
        finalCity = (await cityFromCoords(c)) || 'Unknown City'
      } else if (!finalCity) {
        finalCity = 'Unknown City'
      }

      finalName = finalName || 'Unknown Place'

      let distKm: number | null = null
      let travelMin: number | null = null
      const origin = { lat: REFERENCE_LAT, lng: REFERENCE_LNG }

      if (c) {
        const apiResults = await getDistancesBatch(origin, [c])
        const res = apiResults[0]
        if (res && (!res.status || res.status.code === 0)) {
          distKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null
          const secs = parseDurationSecs(res.duration)
          travelMin = secs ? +(secs / 60).toFixed(1) : null
        }
      }

      let liveDistKm: number | null = null
      let liveTravelMin: number | null = null

      if (c && userLocation) {
        const apiResults = await getDistancesBatch(userLocation, [c])
        const res = apiResults[0]
        if (res && (!res.status || res.status.code === 0)) {
          liveDistKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null
          const secs = parseDurationSecs(res.duration)
          liveTravelMin = secs ? +(secs / 60).toFixed(1) : null
        }
      }

      const row = [finalName, finalCity, link, distKm!, travelMin!, '', liveDistKm, liveTravelMin]
      await appendRow(SPREADSHEET_ID, TAB_NAME, row)

      return { success: true, entry: { name: finalName, city: finalCity, distKm, travelMin, liveDistKm, liveTravelMin } }
    }
  }),
  get_current_location: tool({
    description:
      'Get the user current coordinates and a human-readable address. Use this when the user asks "where am I" or to confirm their current location.',
    inputSchema: z.object({
      userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location provided by the client'),
      userId: z.string().optional().describe('User ID to fetch/store session location')
    }),
    execute: async ({ userLocation, userId }) => {
      let coords = userLocation

      if (!coords) {
        return {
          success: false,
          error: 'GPS_DISABLED',
          message: 'Wah, GPS-mu kayaknya mati bro atau koordinatmu nggak ketemu. Nyalain dulu GPS-nya terus share lokasimu ya!'
        }
      }

      // Reverse geocode to get a human-readable address
      let address = 'Lokasi Tidak Diketahui'
      try {
        const resp = await gmapsClient.reverseGeocode({
          params: { latlng: coords, key: GMAPS_API_KEY },
          timeout: 10000
        })
        address = resp.data.results?.[0]?.formatted_address || 'Lokasi Tidak Diketahui'
      } catch (err) {
        console.error('Reverse geocode error:', err)
      }

      // Sync to session sheet if userId is provided
      if (userId) {
        await setUserLocation(userId, coords)
      }

      return {
        success: true,
        coords,
        address
      }
    }
  })
}
