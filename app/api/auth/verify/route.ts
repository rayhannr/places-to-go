import { NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { password } = await req.json()
    const success = verifyPassword(password)
    return NextResponse.json({ success }, { status: success ? 200 : 401 })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
  }
}
