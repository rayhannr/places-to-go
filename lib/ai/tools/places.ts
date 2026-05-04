import { tool } from 'ai'
import { z } from 'zod'
import { getRows, appendRow, updateVisitDate } from '../../googleSheets'
import { compactPlace, syncLiveDistancesIfNeeded, filterByStatus, fuzzySearchPlaces, SPREADSHEET_ID, TAB_NAME } from './logic'
import {
  Coords,
  resolveShortLink,
  extractCoords,
  extractPlaceName,
  extractPlaceId,
  getPlaceDetails,
  coordsFromPlaceName,
  cityFromCoords,
  getDistancesBatch,
  parseDurationSecs,
  searchGmapsPlaces,
  cleanCityName
} from './utils'

const REFERENCE_LAT = process.env.REFERENCE_LAT ? parseFloat(process.env.REFERENCE_LAT) : NaN
const REFERENCE_LNG = process.env.REFERENCE_LNG ? parseFloat(process.env.REFERENCE_LNG) : NaN

if (isNaN(REFERENCE_LAT) || isNaN(REFERENCE_LNG)) {
  console.warn(
    '⚠️ REFERENCE_LAT or REFERENCE_LNG is missing or invalid in environment variables. Distance calculations from Home will be skipped.'
  )
}

export const get_random_places = tool({
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
})

export const get_nearby_places = tool({
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
      const distA = parseFloat((userLocation ? a['Distance (from current location)'] : a['Distance (km)'] || a.distKm) || (Infinity as any))
      const distB = parseFloat((userLocation ? b['Distance (from current location)'] : b['Distance (km)'] || b.distKm) || (Infinity as any))
      return distA - distB
    })
    return sorted.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
  }
})

export const get_quickest_places = tool({
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
        (userLocation ? a['Travel Time (from current location)'] : a['Travel Time (min)'] || a.travelMin) || (Infinity as any)
      )
      const timeB = parseFloat(
        (userLocation ? b['Travel Time (from current location)'] : b['Travel Time (min)'] || b.travelMin) || (Infinity as any)
      )
      return timeA - timeB
    })
    return sorted.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
  }
})

export const get_places_by_city = tool({
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
    const shuffled = [...filtered].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
  }
})

export const search_places_by_name = tool({
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

    const results = fuzzySearchPlaces(filtered, query)

    return results.slice(0, Math.min(count, 10)).map(res => compactPlace(res.row, !!userLocation))
  }
})

export const add_place = tool({
  description:
    'Adds a new place to the tracker using a Google Maps link. You only need to provide the link. The name and city will be automatically derived from the link if not explicitly provided.',
  inputSchema: z.object({
    name: z.string().optional().describe('Name of the place (Optional, will be automatically extracted from link)'),
    city: z.string().optional().describe('City where the place is located (Optional, will be derived via geocoding)'),
    link: z.string().describe('Google Maps URL (supports short links)'),
    userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
  }),
  execute: async ({ name, city, link, userLocation }: { name?: string; city?: string; link: string; userLocation?: Coords }) => {
    // 🔍 Deduplication Check
    const existingRows = await getRows(SPREADSHEET_ID, TAB_NAME)
    const isDuplicate = existingRows.some(r => (r.Link || r.link || '').includes(link))

    if (isDuplicate) {
      return {
        success: true,
        isDuplicate: true,
        message: 'Tempat ini udah ada di listmu bro, jadi nggak tak tambah lagi biar nggak dobel!'
      }
    }

    const fullUrl = await resolveShortLink(link)
    const placeId = extractPlaceId(fullUrl)
    let c = extractCoords(fullUrl)

    let finalName = name
    let finalCity = city ? cleanCityName(city) : undefined

    // If we have a place_id, use the Places API to get accurate details
    if (placeId) {
      const details = await getPlaceDetails(placeId)
      if (details) {
        if (!finalName && details.name) finalName = details.name
        if (!c && details.coords) c = details.coords
        if (!finalCity && details.city) finalCity = details.city
      }
    }

    // Fallback: extract name from URL
    if (!finalName) finalName = extractPlaceName(fullUrl) ?? undefined

    // Fallback: geocode by name if still no coords
    if (!c && finalName) {
      c = await coordsFromPlaceName(finalName)
    }

    // Fallback: reverse geocode for city
    if (!finalCity && c) {
      const respCity = await cityFromCoords(c)
      finalCity = respCity ? cleanCityName(respCity) : 'Unknown City'
    } else if (!finalCity) {
      finalCity = 'Unknown City'
    }

    finalName = finalName || 'Unknown Place'

    let distKm: number | null = null
    let travelMin: number | null = null
    const origin = { lat: REFERENCE_LAT, lng: REFERENCE_LNG }

    if (c && !isNaN(REFERENCE_LAT) && !isNaN(REFERENCE_LNG)) {
      const apiResults = await getDistancesBatch(origin, [c])
      const res = apiResults[0]
      const isSuccess = res && (!res.status?.code || res.status.code === 0)

      if (isSuccess) {
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
      const isSuccess = res && (!res.status?.code || res.status.code === 0)

      if (isSuccess) {
        liveDistKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null
        const secs = parseDurationSecs(res.duration)
        liveTravelMin = secs ? +(secs / 60).toFixed(1) : null
      }
    }

    // Inject coordinates into the URL if we have them but the URL doesn't (to make future syncs robust)
    let savedUrl = fullUrl
    if (c && !extractCoords(fullUrl)) {
      const separator = fullUrl.includes('?') ? '&' : '?'
      savedUrl = `${fullUrl}${separator}ll=${c.lat},${c.lng}`
    }

    const row = [finalName, finalCity, savedUrl, distKm!, travelMin!, '', liveDistKm, liveTravelMin]
    await appendRow(SPREADSHEET_ID, TAB_NAME, row)

    return { success: true, entry: { name: finalName, city: finalCity, distKm, travelMin, liveDistKm, liveTravelMin } }
  }
})

export const visit_place = tool({
  description: 'Mark a place as visited by updating its visit date.',
  inputSchema: z.object({
    name: z.string().describe('The name of the place to mark as visited'),
    date: z.string().optional().describe('The date visited in YYYY-MM-DD format. Defaults to today if not provided.')
  }),
  execute: async ({ name, date }: { name: string; date?: string }) => {
    const today = new Date().toISOString().split('T')[0]
    const visitDate = date || today

    let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)

    // Find the best match using fuzzy search
    const results = fuzzySearchPlaces(allRows, name)

    const bestMatch = results[0]

    // Threshold for matching: if the score is too high, it's likely not a match
    if (!bestMatch || bestMatch.score > 5) {
      return {
        success: false,
        message: `Waduh, tempat bernama "${name}" nggak ketemu di listmu. Coba cek lagi namanya, bro.`
      }
    }

    await updateVisitDate(SPREADSHEET_ID, TAB_NAME, bestMatch.index, visitDate)

    return {
      success: true,
      placeName: bestMatch.row.Name || bestMatch.row.name,
      visitDate,
      message: `Mantap! "${bestMatch.row.Name || bestMatch.row.name}" udah gue tandai dikunjungi tanggal ${visitDate}.`
    }
  }
})

export const search_google_maps = tool({
  description:
    'Search for places directly on Google Maps (not in the personal list). Use this when the user wants to discover new places or search globally.',
  inputSchema: z.object({
    query: z.string().describe('The search query (e.g., "Soto Bu Slamet Jogja")')
  }),
  execute: async ({ query }: { query: string }) => {
    const results = await searchGmapsPlaces(query)

    return results.slice(0, 3).map(res => {
      const addressParts = res.formatted_address?.split(', ') || []
      let city = 'Unknown City'
      if (addressParts.length >= 3) {
        // Heuristic for Indonesian addresses: City is usually 3rd from the end
        city = addressParts[addressParts.length - 3]
      } else if (addressParts.length === 2) {
        city = addressParts[0]
      }

      return {
        name: res.name,
        city: cleanCityName(city),
        link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(res.name || '')}&query_place_id=${res.place_id}`
      }
    })
  }
})
