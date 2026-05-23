import { tool } from 'ai'
import { z } from 'zod'
import { getRows, saveChatSession, getChatSession } from '../../googleSheets'
import { syncLiveDistancesIfNeeded, SPREADSHEET_ID, TAB_NAME } from './logic'
import { gmapsClient, GMAPS_API_KEY, haversineDistance, resolveCoordsFromLocationInput } from './utils'

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
    userId: z.string().optional().describe('Unique ID for the current user session')
  }),
  execute: async ({ userLocation, locationLink, userId }) => {
    let locationToUse = userLocation
    let sourceLabel = 'lokasi sekarang'
    let saveSession = true

    if (locationLink) {
      const customCoords = await resolveCoordsFromLocationInput(locationLink)
      if (!customCoords) {
        return {
          success: false,
          error: 'INVALID_CUSTOM_LOCATION',
          message:
            'Gak bisa baca link lokasi itu, bro. Pastikan itu Google Maps link atau titik koordinat yang valid, terus coba lagi.'
        }
      }
      locationToUse = customCoords
      sourceLabel = 'lokasi kustom yang kamu kirim'
      saveSession = false
    }

    if (!locationToUse) {
      return {
        success: false,
        error: 'GPS_DISABLED',
        message: 'Lokasimu nggak ketemu bro. Share dulu GPS-nya atau kirim link Google Maps lokasi yang jelas.'
      }
    }

    const rows = await getRows(SPREADSHEET_ID, TAB_NAME)
    if (rows.length === 0) {
      return { success: true, updated: false, message: 'List tempatmu masih kosong bro.' }
    }

    const compactPlace = (r: any) => ({
      name: r.Name,
      city: r.City,
      distance: r['Distance (from current location)']
    })

    const nearby = rows
      .sort((a, b) => {
        const distA = parseFloat(String(a['Distance (from current location)'] || 999))
        const distB = parseFloat(String(b['Distance (from current location)'] || 999))
        return distA - distB
      })
      .slice(0, 3)
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
            nearby,
            message: `Lokasimu cuma geser ${moveDist.toFixed(2)}km dari sync terakhir. Masih akurat kok datanya.`
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
      nearby,
      message: `Mantap! Barusan tak update jarak buat ${rows.length} tempat berdasarkan ${sourceLabel}.`
    }
  }
})
