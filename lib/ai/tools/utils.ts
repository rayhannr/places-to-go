import https from 'https'
import { Client, AddressType } from '@googlemaps/google-maps-services-js'
import axios from 'axios'

export const GMAPS_API_KEY = process.env.GMAPS_API_KEY!
export const gmapsClient = new Client({})

export interface Coords {
  lat: number
  lng: number
}

export interface DistanceMatrixResult {
  originIndex?: number
  destinationIndex?: number
  distanceMeters?: number
  duration?: string | { seconds: string }
  status?: { code: number }
}

/**
 * Calculates the straight-line distance between two points in km.
 * Used for the "3km rule" check to avoid unnecessary API calls.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function resolveShortLink(url: string): Promise<string> {
  // Unwrap google.com/url?q=... redirectors
  if (url.includes('google.com/url?q=')) {
    try {
      const urlObj = new URL(url)
      const q = urlObj.searchParams.get('q')
      if (q) return resolveShortLink(q)
    } catch (e) {}
  }

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

export function extractCoords(url: string | null): Coords | null {
  if (!url) return null
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  return null
}

export function extractPlaceName(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/maps\/place\/([^\/@]+)/)
  if (m) {
    const full = decodeURIComponent(m[1].replace(/\+/g, ' '))
    return full.split(/,\s*| - /)[0].trim()
  }

  // Handle search/query URLs
  try {
    const urlObj = new URL(url)
    const query = urlObj.searchParams.get('query')
    if (query && !query.match(/^-?\d+\.\d+,-?\d+\.\d+$/)) {
      return query.split(/,\s*| - /)[0].trim()
    }
  } catch (e) {}

  return null
}

export async function coordsFromPlaceName(placeName: string): Promise<Coords | null> {
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

export function cleanCityName(name: string): string {
  return name.replace(/^(Kabupaten|Kota)\s+/i, '')
}

export async function cityFromCoords(coords: Coords): Promise<string | null> {
  try {
    const resp = await gmapsClient.reverseGeocode({
      params: { latlng: coords, key: GMAPS_API_KEY },
      timeout: 10000
    })
    const result = resp.data.results?.[0]
    if (result && result.address_components) {
      const isCity = (c: { types: string[] }) =>
        c.types.includes(AddressType.locality) || c.types.includes(AddressType.administrative_area_level_2)
      const cityComp = result.address_components.find(isCity)
      if (cityComp) {
        return cleanCityName(cityComp.long_name)
      }
    }
  } catch (err) {}
  return null
}

export async function getDistancesBatch(origin: Coords, destinations: Coords[]): Promise<DistanceMatrixResult[]> {
  const url = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
  const CHUNK_SIZE = 600
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
    try {
      const resp = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GMAPS_API_KEY,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,status'
        },
        timeout: 30000
      })

      if (Array.isArray(resp.data)) {
        const adjusted = resp.data.map(r => ({
          ...r,
          destinationIndex: r.destinationIndex !== undefined ? r.destinationIndex + i : undefined
        }))
        allResults = allResults.concat(adjusted)
      } else {
        console.error('Unexpected Routes API response format:', resp.data)
      }
    } catch (err: any) {
      console.error('Routes API Error:', err.response?.data || err.message)
      // Keep going for other chunks if they exist
    }
  }

  return allResults.sort((a, b) => (a.destinationIndex || 0) - (b.destinationIndex || 0))
}

export function parseDurationSecs(duration: string | { seconds: string } | undefined): number | null {
  if (!duration) return null
  if (typeof duration === 'string') {
    const m = duration.match(/([\d.]+)s/)
    return m ? parseFloat(m[1]) : null
  }
  if (typeof duration === 'object') {
    return duration.seconds ? parseInt(duration.seconds) : null
  }
  return null
}

export interface GmapsPlace {
  name?: string
  formatted_address?: string
  place_id?: string
}

export async function searchGmapsPlaces(query: string): Promise<GmapsPlace[]> {
  try {
    const url = 'https://places.googleapis.com/v1/places:searchText'
    const resp = await axios.post<{
      places?: Array<{
        displayName?: { text: string }
        formattedAddress?: string
        id: string
      }>
    }>(
      url,
      { textQuery: query },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GMAPS_API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id'
        },
        timeout: 10000
      }
    )

    const places = resp.data.places || []
    return places.map(p => ({
      name: p.displayName?.text || 'Unknown Name',
      formatted_address: p.formattedAddress,
      place_id: p.id
    }))
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('Gmaps Search Error:', err.response?.data || err.message)
    } else {
      console.error('Gmaps Search Error:', err)
    }
    return []
  }
}

export function extractPlaceId(url: string | null): string | null {
  if (!url) return null
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('query_place_id') || urlObj.searchParams.get('ftid') || null
  } catch (e) {
    return null
  }
}

export async function getPlaceDetails(placeId: string): Promise<{ name?: string; coords?: Coords; city?: string } | null> {
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`
    const resp = await axios.get<{
      displayName?: { text: string }
      location?: { latitude: number; longitude: number }
      addressComponents?: Array<{ longText: string; types: string[] }>
    }>(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GMAPS_API_KEY,
        'X-Goog-FieldMask': 'displayName,location,addressComponents'
      },
      timeout: 10000
    })

    const data = resp.data
    let city: string | undefined
    if (data.addressComponents) {
      const cityComp = data.addressComponents.find(
        c => c.types.includes('locality') || c.types.includes('administrative_area_level_2')
      )
      if (cityComp) city = cleanCityName(cityComp.longText)
    }

    return {
      name: data.displayName?.text,
      coords: data.location ? { lat: data.location.latitude, lng: data.location.longitude } : undefined,
      city
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('Gmaps Place Details Error:', err.response?.data || err.message)
    } else {
      console.error('Gmaps Place Details Error:', err)
    }
    return null
  }
}
