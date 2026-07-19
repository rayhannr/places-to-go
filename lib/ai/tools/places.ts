import { tool } from 'ai'
import { z } from 'zod'
import { getRows, appendRow, updateVisitDate, deleteRow, updatePriorities, updatePlaceFields } from '../../googleSheets'
import {
  compactPlace,
  syncLiveDistancesIfNeeded,
  filterByStatus,
  fuzzySearchPlaces,
  findPlaceByName,
  placeNotFoundMessage,
  getPrioritizedEntries,
  buildPriorityUpdates,
  SPREADSHEET_ID,
  TAB_NAME
} from './logic'
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
      const distA = parseFloat((userLocation ? a['Distance (from current location)'] : a['Distance (km)']) || (Infinity as any))
      const distB = parseFloat((userLocation ? b['Distance (from current location)'] : b['Distance (km)']) || (Infinity as any))
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
      const timeA = parseFloat((userLocation ? a['Travel Time (from current location)'] : a['Travel Time (min)']) || (Infinity as any))
      const timeB = parseFloat((userLocation ? b['Travel Time (from current location)'] : b['Travel Time (min)']) || (Infinity as any))
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
      const rowCity = (r.City || '').toLowerCase()
      return rowCity.includes(city.toLowerCase())
    })
    const shuffled = [...filtered].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(count, 10)).map(r => compactPlace(r, !!userLocation))
  }
})

export const get_places_by_category = tool({
  description:
    'Get places filtered by a specific category (e.g. cuisine or type of food). A place can have multiple categories (comma-separated); pass a single category or a comma-separated list to match any of them.',
  inputSchema: z.object({
    category: z.string().describe('The category to filter by. Pass a comma-separated list to match places having any of them'),
    count: z.number().optional().default(1).describe('Number of places to return (1-10)'),
    status: z.enum(['visited', 'unvisited']).optional().default('unvisited'),
    userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
  }),
  execute: async ({
    category,
    count = 1,
    status = 'unvisited',
    userLocation
  }: {
    category: string
    count?: number
    status?: 'visited' | 'unvisited'
    userLocation?: Coords
  }) => {
    let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
    if (userLocation) {
      allRows = await syncLiveDistancesIfNeeded(allRows, userLocation)
    }
    const queryCategories = category
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(Boolean)
    const filtered = filterByStatus(allRows, status).filter(r => {
      const rowCategories = (r.Category || '')
        .split(',')
        .map(c => c.trim().toLowerCase())
        .filter(Boolean)
      return queryCategories.some(q => rowCategories.some(rc => rc.includes(q)))
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
    category: z
      .string()
      .optional()
      .describe(
        'Category of the place, e.g. cuisine or type of food (Optional, leave empty if not given). Supports multiple categories as a comma-separated list, formatted lowercase with no space after the comma (an individual category name may itself contain spaces), e.g. "japanese,spicy food"'
      ),
    userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location for live distance')
  }),
  execute: async ({
    name,
    city,
    link,
    category,
    userLocation
  }: {
    name?: string
    city?: string
    link: string
    category?: string
    userLocation?: Coords
  }) => {
    const existingRows = await getRows(SPREADSHEET_ID, TAB_NAME)

    // 🔍 Early Deduplication Check (Raw Link)
    if (existingRows.some(r => (r.Link || '').includes(link))) {
      return {
        success: true,
        isDuplicate: true,
        message: 'Bro that\'s already on the list. You think I wasn\'t gonna catch that?'
      }
    }

    const fullUrl = await resolveShortLink(link)
    let placeId = extractPlaceId(fullUrl)
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

    // If we STILL don't have a placeId, try to search for it using the name
    if (!placeId && finalName) {
      const searchResults = await searchGmapsPlaces(finalName)
      if (searchResults.length > 0 && searchResults[0].place_id) {
        placeId = searchResults[0].place_id || null
      }
    }

    // 🔍 Smarter Deduplication Check (Place ID)
    if (placeId) {
      const isDuplicateById = existingRows.some(r => extractPlaceId(r.Link || '') === placeId)
      if (isDuplicateById) {
        return {
          success: true,
          isDuplicate: true,
          message: 'Nah the place ID snitched on you. Already in the list, nice try though.'
        }
      }
    }

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

    // Inject coordinates and place_id into the URL if we have them but the URL doesn't
    let savedUrl = fullUrl
    if (c && !extractCoords(savedUrl)) {
      const separator = savedUrl.includes('?') ? '&' : '?'
      savedUrl = `${savedUrl}${separator}ll=${c.lat},${c.lng}`
    }
    if (placeId && !extractPlaceId(savedUrl)) {
      const separator = savedUrl.includes('?') ? '&' : '?'
      savedUrl = `${savedUrl}${separator}query_place_id=${placeId}`
    }

    const finalCategory = category || ''

    const row = [finalName, finalCity, savedUrl, distKm!, travelMin!, '', liveDistKm, liveTravelMin, '', finalCategory]
    await appendRow(SPREADSHEET_ID, TAB_NAME, row)

    return { success: true, entry: { name: finalName, city: finalCity, distKm, travelMin, liveDistKm, liveTravelMin, category: finalCategory || null } }
  }
})

export const visit_place = tool({
  description: 'Mark a place as visited by updating its visit date, or clear the visit date if it was marked by mistake.',
  inputSchema: z.object({
    name: z.string().describe('The name of the place to mark as visited'),
    date: z.string().optional().describe('The date visited in YYYY-MM-DD format. Defaults to today if not provided.'),
    unvisit: z.boolean().optional().describe('Set to true if you want to clear/delete the visit date for this place.')
  }),
  execute: async ({ name, date, unvisit }: { name: string; date?: string; unvisit?: boolean }) => {
    const today = new Date().toISOString().split('T')[0]
    const visitDate = unvisit ? '' : date || today

    let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)

    const bestMatch = findPlaceByName(allRows, name)
    if (!bestMatch) {
      return { success: false, message: placeNotFoundMessage(name) }
    }

    await updateVisitDate(SPREADSHEET_ID, TAB_NAME, bestMatch.index, visitDate)

    const finalName = bestMatch.row.Name
    if (unvisit) {
      return {
        success: true,
        placeName: finalName,
        message: `Bet, "${finalName}"'s visit status is wiped. Never happened.`
      }
    }

    // Visited places don't belong on the "go next" priority list — clear it and close the gap.
    const oldPriority = parseInt(String(bestMatch.row.Priority ?? ''), 10)
    if (!isNaN(oldPriority) && oldPriority > 0) {
      const others = getPrioritizedEntries(allRows, bestMatch.index)
      await updatePriorities(SPREADSHEET_ID, TAB_NAME, [...buildPriorityUpdates(others), { rowIndex: bestMatch.index, priority: '' }])
    }

    return {
      success: true,
      placeName: finalName,
      visitDate,
      message: `Let's fucking go, "${finalName}" hit on ${visitDate}.`
    }
  }
})

export const delete_place = tool({
  description: 'Delete a place from the personal tracker list completely.',
  inputSchema: z.object({
    name: z.string().describe('The name of the place to delete')
  }),
  execute: async ({ name }: { name: string }) => {
    let allRows = await getRows(SPREADSHEET_ID, TAB_NAME)

    const bestMatch = findPlaceByName(allRows, name)
    if (!bestMatch) {
      return { success: false, message: placeNotFoundMessage(name) }
    }

    const oldPriority = parseInt(String(bestMatch.row.Priority ?? ''), 10)
    const hadPriority = !isNaN(oldPriority) && oldPriority > 0

    await deleteRow(SPREADSHEET_ID, TAB_NAME, bestMatch.index)

    if (hadPriority) {
      // Row is gone, so row indices below it shifted up — re-fetch fresh indices before renumbering.
      const freshRows = await getRows(SPREADSHEET_ID, TAB_NAME)
      const updates = buildPriorityUpdates(getPrioritizedEntries(freshRows))
      if (updates.length > 0) {
        await updatePriorities(SPREADSHEET_ID, TAB_NAME, updates)
      }
    }

    const finalName = bestMatch.row.Name
    return {
      success: true,
      placeName: finalName,
      message: `"${finalName}" deleted. Gone. Wiped. Like it never existed.`
    }
  }
})

export const get_priority_places = tool({
  description:
    'Get places from the "want to go next" priority list, sorted by rank ascending (priority 1 = go there first). Only returns places that actually have a priority set.',
  inputSchema: z.object({
    count: z.number().optional().default(10).describe('Number of places to return (1-20)')
  }),
  execute: async ({ count = 10 }: { count?: number }) => {
    const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)
    const entries = getPrioritizedEntries(allRows)

    return entries.slice(0, Math.min(count, 20)).map(p => ({
      ...compactPlace(allRows[p.index - 2]),
      priority: p.priority
    }))
  }
})

export const prioritize_place = tool({
  description:
    'Set or update a place\'s rank on the "want to go next" priority list, or pull it off the list entirely. Lower numbers mean higher priority (1 = go there first). Omit the priority to send the place to the back of the queue. Pass deprioritize: true to remove it from the queue without touching visit status. Automatically shifts other prioritized places to keep ranks contiguous.',
  inputSchema: z.object({
    name: z.string().describe('The name of the place to prioritize'),
    priority: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Desired priority rank (1 = highest). Omit to send it to the back of the priority list.'),
    deprioritize: z
      .boolean()
      .optional()
      .describe('Set to true to remove the place from the priority list entirely (clears its rank). Ignores the priority field if set.')
  }),
  execute: async ({ name, priority, deprioritize }: { name: string; priority?: number; deprioritize?: boolean }) => {
    const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)

    const bestMatch = findPlaceByName(allRows, name)
    if (!bestMatch) {
      return { success: false, message: placeNotFoundMessage(name) }
    }

    const finalName = bestMatch.row.Name

    if (deprioritize) {
      const oldPriority = parseInt(String(bestMatch.row.Priority ?? ''), 10)
      if (isNaN(oldPriority) || oldPriority <= 0) {
        return {
          success: false,
          message: `"${finalName}" ain't even on the priority list, dumbass. Nothing to remove.`
        }
      }

      const others = getPrioritizedEntries(allRows, bestMatch.index)
      await updatePriorities(SPREADSHEET_ID, TAB_NAME, [...buildPriorityUpdates(others), { rowIndex: bestMatch.index, priority: '' }])

      return {
        success: true,
        placeName: finalName,
        priority: null,
        message: `"${finalName}" is off the priority list. Back to being just another place.`
      }
    }

    if (bestMatch.row['Date Visited']) {
      return {
        success: false,
        message: `Bro you already went to "${finalName}". Why you tryna prioritize a place you already conquered? Get your shit together.`
      }
    }

    const others = getPrioritizedEntries(allRows, bestMatch.index)
    const insertAt = !priority || priority > others.length ? others.length : priority - 1

    const finalOrder = [
      ...others.slice(0, insertAt),
      { index: bestMatch.index, name: finalName, priority: 0 },
      ...others.slice(insertAt)
    ]

    await updatePriorities(SPREADSHEET_ID, TAB_NAME, buildPriorityUpdates(finalOrder))

    const finalPriority = insertAt + 1

    return {
      success: true,
      placeName: finalName,
      priority: finalPriority,
      priorityList: finalOrder.map((p, i) => ({ name: p.name, priority: i + 1 })),
      message: `"${finalName}" locked in at priority ${finalPriority}. Let's get it.`
    }
  }
})

export const update_place = tool({
  description:
    'Update one or more fields (name, city, Google Maps link, category) of an existing place in the tracker. Only pass the fields that should change; anything omitted is left untouched. Does NOT recalculate distance/travel time even if the link changes — use sync_all_distances for that separately.',
  inputSchema: z.object({
    name: z.string().describe('The current name of the place to update (used to find it via fuzzy matching)'),
    newName: z.string().optional().describe('New name for the place (Optional)'),
    city: z.string().optional().describe('New city for the place (Optional)'),
    link: z.string().optional().describe('New Google Maps link for the place. Stored as-is, not re-resolved or re-parsed (Optional)'),
    category: z
      .string()
      .optional()
      .describe(
        'New category for the place, formatted lowercase with no space after the comma (an individual category name may itself contain spaces). Pass a comma-separated list for multiple categories, e.g. "japanese,spicy food" (Optional). Replaces the place\'s entire category value.'
      )
  }),
  execute: async ({
    name,
    newName,
    city,
    link,
    category
  }: {
    name: string
    newName?: string
    city?: string
    link?: string
    category?: string
  }) => {
    if (!newName && !city && !link && !category) {
      return { success: false, message: 'Bro you gotta give me SOMETHING to change. Name, city, link, category — pick one.' }
    }

    const allRows = await getRows(SPREADSHEET_ID, TAB_NAME)

    const bestMatch = findPlaceByName(allRows, name)
    if (!bestMatch) {
      return { success: false, message: placeNotFoundMessage(name) }
    }

    await updatePlaceFields(SPREADSHEET_ID, TAB_NAME, bestMatch.index, { name: newName, city, link, category })

    const finalName = newName || bestMatch.row.Name
    const changedFields = [
      newName && 'name',
      city && 'city',
      link && 'link',
      category && 'category'
    ].filter(Boolean) as string[]

    return {
      success: true,
      placeName: finalName,
      updated: { name: newName, city, link, category },
      message: `"${finalName}" updated (${changedFields.join(', ')}). Locked in.`
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
