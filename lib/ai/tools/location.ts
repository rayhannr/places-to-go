import { tool } from 'ai'
import { z } from 'zod'
import { setUserLocation } from '../../googleSheets'
import { gmapsClient, GMAPS_API_KEY } from './utils'

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
      await setUserLocation(userId, coords)
    }

    return {
      success: true,
      coords,
      address
    }
  }
})
