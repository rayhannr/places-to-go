import { NextResponse } from 'next/server'
import { isPasswordRequired } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    required: isPasswordRequired()
  })
}
