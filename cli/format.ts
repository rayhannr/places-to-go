/** Pretty-prints a tool's JSON result. Arrays of flat objects render as a table; everything else as JSON. */
export function printResult(result: unknown): void {
  if (Array.isArray(result) && result.every(isFlatObject)) {
    printTable(result as Record<string, unknown>[])
    return
  }
  if (isPaginatedResult(result)) {
    printTable(result.places)
    console.log(`page ${result.page}/${result.totalPages} (${result.totalCount} total)`)
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

function isPaginatedResult(
  value: unknown
): value is { places: Record<string, unknown>[]; page: number; totalPages: number; totalCount: number } {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.places) &&
    v.places.every(isFlatObject) &&
    typeof v.page === 'number' &&
    typeof v.totalPages === 'number' &&
    typeof v.totalCount === 'number'
  )
}

function isFlatObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(v => typeof v !== 'object' || v === null)
  )
}

const MAX_CELL_LENGTH = 60

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log('(no results)')
    return
  }
  const truncated = rows.map(row =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, truncate(v)]))
  )
  console.table(truncated)
}

function truncate(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_CELL_LENGTH) {
    return `${value.slice(0, MAX_CELL_LENGTH)}…`
  }
  return value
}
