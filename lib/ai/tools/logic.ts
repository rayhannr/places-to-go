import { PlaceRow, updateLiveDistances } from '../../googleSheets'
import { Coords, extractCoords, getDistancesBatch, haversineDistance, parseDurationSecs } from './utils'

export const SPREADSHEET_ID = process.env.SPREADSHEET_ID!
export const TAB_NAME = 'Food'

export function compactPlace(r: PlaceRow, useLive = false) {
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

export async function syncLiveDistancesIfNeeded(rows: PlaceRow[], userLocation: Coords | undefined): Promise<PlaceRow[]> {
  if (!userLocation) return rows
  if (rows.length === 0) return rows

  const firstRow = rows[0]
  const storedDist = firstRow['Distance (from current location)']
  const firstCoords = extractCoords(firstRow.Link)

  const needsInitialization = storedDist === null || storedDist === undefined || storedDist === ''

  let shouldUpdate = needsInitialization

  if (!needsInitialization && firstCoords) {
    const currentRealDist = haversineDistance(userLocation.lat, userLocation.lng, firstCoords.lat, firstCoords.lng)
    const diff = Math.abs(currentRealDist - parseFloat(storedDist.toString()))

    if (diff > 2) {
      shouldUpdate = true
    }
  }

  if (shouldUpdate) {
    console.log('Recalculating distances for all rows...')
    const destinationCoords = rows.map(r => extractCoords(r.Link)).filter((c): c is Coords => !!c)
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
          rows[rowIndex]['Distance (from current location)'] = distKm
          rows[rowIndex]['Travel Time (from current location)'] = travelMin
        }
      }
    })

    await updateLiveDistances(SPREADSHEET_ID, TAB_NAME, updateValues)
  }

  return rows
}

export function filterByStatus(rows: PlaceRow[], status: 'visited' | 'unvisited') {
  return rows.filter(r => (status === 'visited' ? !!r['Date Visited'] : !r['Date Visited']))
}
