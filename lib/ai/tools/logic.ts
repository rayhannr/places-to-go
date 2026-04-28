import { PlaceRow, updateLiveDistances, updateSheetLinks } from '../../googleSheets'
import { Coords, extractCoords, getDistancesBatch, haversineDistance, parseDurationSecs, resolveShortLink, coordsFromPlaceName } from './utils'

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
    console.log(`[Sync] Distance check: current=${currentRealDist.toFixed(3)}km, stored=${storedDist}km, diff=${diff.toFixed(3)}km`)

    if (diff > 2) {
      shouldUpdate = true
    } else {
      console.log('[Sync] Skipping update: movement < 2km')
    }
  } else if (!needsInitialization && !firstCoords) {
    console.log('[Sync] No coordinates found in link, forcing update...')
    shouldUpdate = true
  }

  if (shouldUpdate) {
    console.log(`[Sync] Recalculating distances for ${rows.length} rows...`)

    // Resolve short links and find coordinates (with geocode fallback)
    const resolvedRows = await Promise.all(
      rows.map(async (r, index) => {
        const link = r.Link || r.link || ''
        const name = r.Name || r.name || ''
        const city = r.City || r.city || ''
        
        const needsResolve = link.includes('maps.app.goo.gl') || link.includes('goo.gl/maps')
        const fullUrl = needsResolve ? await resolveShortLink(link) : link
        
        let coords = extractCoords(fullUrl)
        
        // Last Resort: Geocode by Name + City if link is still coord-less
        if (!coords && name) {
          console.log(`[Sync] Last resort: Geocoding "${name}, ${city}"`)
          coords = await coordsFromPlaceName(`${name}, ${city}`)
        }

        return { ...r, resolvedLink: fullUrl, coords, originalIndex: index }
      })
    )

    const rowsWithCoords = resolvedRows.filter(r => !!r.coords)
    const destinationCoords = rowsWithCoords.map(r => r.coords as Coords)

    if (destinationCoords.length === 0) {
      console.warn('[Sync] No destinations with valid coordinates found.')
      return rows
    }

    const results = await getDistancesBatch(userLocation, destinationCoords)
    console.log(`[Sync] API returned ${results.length} distance results.`)
    
    const updateValues: (string | number | null)[][] = rows.map(() => [null, null])
    const linkUpdateValues: (string | null)[][] = rows.map(r => [r.Link || r.link || null])
    let linksChanged = false

    results.forEach(res => {
      const isSuccess = !res.status || res.status.code === 0 || Object.keys(res.status).length === 0
      if (res.destinationIndex !== undefined && isSuccess) {
        const distKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null
        const secs = parseDurationSecs(res.duration)
        const travelMin = secs ? +(secs / 60).toFixed(1) : null

        const matchedRow = rowsWithCoords[res.destinationIndex]
        const rowIndex = matchedRow.originalIndex
        
        if (rowIndex !== undefined && rowIndex !== -1) {
          updateValues[rowIndex] = [distKm, travelMin]
          rows[rowIndex]['Distance (from current location)'] = distKm
          rows[rowIndex]['Travel Time (from current location)'] = travelMin
          
          // Check if link was repaired (resolved or tagged)
          const originalLink = rows[rowIndex].Link || rows[rowIndex].link
          const repairedLink = matchedRow.resolvedLink
          
          // Inject tag if we geocoded but URL is still coord-less
          let finalLink = repairedLink
          if (matchedRow.coords && !extractCoords(repairedLink)) {
            const separator = repairedLink.includes('?') ? '&' : '?'
            finalLink = `${repairedLink}${separator}ll=${matchedRow.coords.lat},${matchedRow.coords.lng}`
          }

          if (finalLink !== originalLink) {
            linkUpdateValues[rowIndex] = [finalLink]
            rows[rowIndex].Link = finalLink // Update local object
            linksChanged = true
          }
        }
      }
    })

    if (linksChanged) {
      console.log('[Sync] Repairing links in Google Sheets...')
      await updateSheetLinks(SPREADSHEET_ID, TAB_NAME, linkUpdateValues)
    }

    console.log('[Sync] Sending distance updates to Google Sheets...')
    await updateLiveDistances(SPREADSHEET_ID, TAB_NAME, updateValues)
    console.log('[Sync] Sheet update completed.')
  }

  return rows
}

export function filterByStatus(rows: PlaceRow[], status: 'visited' | 'unvisited') {
  return rows.filter(r => (status === 'visited' ? !!r['Date Visited'] : !r['Date Visited']))
}
