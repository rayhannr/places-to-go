import { tool } from 'ai'
import { z } from 'zod'
import { getRows, saveChatSession, getChatSession } from '../../googleSheets'
import { syncLiveDistancesIfNeeded, filterByStatus, SPREADSHEET_ID, TAB_NAME } from './logic'
import {
  gmapsClient,
  GMAPS_API_KEY,
  haversineDistance,
  resolveCoordsFromLocationInput,
  extractPlaceDetailsFromLink
} from './utils'

export const get_current_location = tool({
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
        message: 'GPS is off or you live in the middle of nowhere, bro. Turn that shit on and share your damn location.'
      }
    }

    // Reverse geocode to get a human-readable address
    let address = 'Unknown Location'
    try {
      const resp = await gmapsClient.reverseGeocode({
        params: { latlng: coords, key: GMAPS_API_KEY },
        timeout: 10000
      })
      address = resp.data.results?.[0]?.formatted_address || 'Unknown Location'
    } catch (err) {
      console.error('Reverse geocode error:', err)
    }

    // Sync to session sheet if userId is provided
    if (userId) {
      await saveChatSession(userId, { lat: coords.lat, lng: coords.lng })
    }

    return {
      success: true,
      coords,
      address
    }
  }
})

export const sync_all_distances = tool({
  description:
    "Manually trigger a recalculation of distances and travel times to all saved places. Use an optional Google Maps link or custom location string to sync from a different location than the user's GPS.",
  inputSchema: z.object({
    userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location provided by the client'),
    locationLink: z.string().optional().describe('Google Maps URL to sync distances from exactly, used when the user sends a Maps link'),
    userId: z.string().optional().describe('Unique ID for the current user session'),
    status: z.enum(['visited', 'unvisited']).optional().default('unvisited').describe('Filter nearby places by visit status'),
    count: z.number().optional().default(5).describe('Number of nearby places to return (1-10)')
  }),
  execute: async ({ userLocation, locationLink, userId, status = 'unvisited', count = 5 }) => {
    let locationToUse = userLocation
    let sourceLabel = 'current location'
    let saveSession = true

    if (locationLink) {
      const customCoords = await resolveCoordsFromLocationInput(locationLink)
      if (!customCoords) {
        return {
          success: false,
          error: 'INVALID_CUSTOM_LOCATION',
          message:
            'That location link is trash, bro. Send a real Maps link or actual coordinates, damn.'
        }
      }
      locationToUse = customCoords
      sourceLabel = 'custom location you sent'
      saveSession = false
    }

    if (!locationToUse) {
      return {
        success: false,
        error: 'GPS_DISABLED',
        message: 'Still no idea where you are, bro. Share your GPS or send a proper Maps link, come on.'
      }
    }

    const rows = await getRows(SPREADSHEET_ID, TAB_NAME)
    if (rows.length === 0) {
      return { success: true, updated: false, message: 'List is empty, bro. Nothing to sync. Go add some places first.' }
    }

    const compactPlace = (r: any) => ({
      name: r.Name,
      city: r.City,
      distance: r['Distance (from current location)']
    })

    const getNearby = () =>
      [...filterByStatus(rows, status)]
        .sort((a, b) => {
          const distA = parseFloat(String(a['Distance (from current location)'] || 999))
          const distB = parseFloat(String(b['Distance (from current location)'] || 999))
          return distA - distB
        })
        .slice(0, Math.min(count, 10))
        .map(r => compactPlace(r))

    if (!locationLink && userId) {
      const session = await getChatSession(userId)
      if (session.lat && session.lng) {
        const moveDist = haversineDistance(locationToUse.lat, locationToUse.lng, session.lat, session.lng)
        if (moveDist <= 2) {
          return {
            success: true,
            updated: false,
            count: rows.length,
            nearby: getNearby(),
            message: `You barely moved ${moveDist.toFixed(2)}km, bro. Data's still fresh. Chill.`
          }
        }
      }
    }

    await syncLiveDistancesIfNeeded(rows, locationToUse, !!locationLink)

    if (saveSession && userId) {
      await saveChatSession(userId, { lat: locationToUse.lat, lng: locationToUse.lng })
    }

    return {
      success: true,
      updated: true,
      count: rows.length,
      nearby: getNearby(),
      message: `Done. Updated ${rows.length} places from ${sourceLabel}. Happy now?`
    }
  }
})
export const parse_place_link = tool({
  description:
    'Parse a Google Maps or coordinate link to extract the place name and coordinates so it can be used for syncing distance.',
  inputSchema: z.object({
    link: z.string().describe('Google Maps URL, Maps short link, or coordinate text')
  }),
  execute: async ({ link }) => {
    const details = await extractPlaceDetailsFromLink(link)

    if (!details.coords && !details.name) {
      return {
        success: false,
        error: 'INVALID_PLACE_LINK',
        message:
          'That link is unreadable, bro. Give me a proper Maps link or actual coords like `-7.7828,110.3608`.'
      }
    }

    return {
      success: true,
      coords: details.coords,
      placeName: details.name,
      resolvedLink: details.resolvedLink
    }
  }
})