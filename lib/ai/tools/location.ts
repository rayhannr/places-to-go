import { tool } from 'ai'
import { z } from 'zod'
import { getRows, saveChatSession, getChatSession } from '../../googleSheets'
import { syncLiveDistancesIfNeeded, SPREADSHEET_ID, TAB_NAME } from './logic'
import { gmapsClient, GMAPS_API_KEY, haversineDistance } from './utils'

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
    "Manually trigger a recalculation of distances and travel times from the user's current location to all saved places. Only recalculates if the user has moved more than 2km since the last sync.",
  inputSchema: z.object({
    userLocation: z.object({ lat: z.number(), lng: z.number() }).optional().describe('User current location provided by the client'),
    userId: z.string().optional().describe('Unique ID for the current user session')
  }),
  execute: async ({ userLocation, userId }) => {
    if (!userLocation) {
      return {
        success: false,
        error: 'GPS_DISABLED',
        message: 'Lokasimu nggak ketemu bro. Share dulu GPS-nya biar bisa tak hitung jaraknya.'
      }
    }

    const rows = await getRows(SPREADSHEET_ID, TAB_NAME)
    if (rows.length === 0) {
      return { success: true, updated: false, message: 'List tempatmu masih kosong bro.' }
    }

    const compactPlace = (r: any) => ({
      name: r.Name || r.name,
      city: r.City || r.city,
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

    // 1. Check movement against Session location (Consistency check)
    if (userId) {
      const session = await getChatSession(userId)
      if (session.lat && session.lng) {
        const moveDist = haversineDistance(userLocation.lat, userLocation.lng, session.lat, session.lng)
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

    // 2. Perform the actual sync
    await syncLiveDistancesIfNeeded(rows, userLocation)

    // 3. Save new location to session as the new reference point
    if (userId) {
      await saveChatSession(userId, { lat: userLocation.lat, lng: userLocation.lng })
    }

    return {
      success: true,
      updated: true,
      count: rows.length,
      nearby,
      message: `Mantap! Barusan tak update jarak buat ${rows.length} tempat biar akurat.`
    }
  }
})
