import { NextResponse } from 'next/server'
import { getRows } from '@/lib/googleSheets'
import { compactPlace, SPREADSHEET_ID, TAB_NAME } from '@/lib/ai/tools/logic'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await getRows(SPREADSHEET_ID, TAB_NAME)
    const compacted = rows.map((r, i) => ({
      ...compactPlace(r),
      index: i + 2
    }))
    return NextResponse.json(compacted)
  } catch (error: any) {
    console.error('Error fetching places:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch places' },
      { status: 500 }
    )
  }
}
