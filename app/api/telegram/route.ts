import { webhookCallback } from 'grammy'
import { bot } from '@/lib/bot'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (process.env.DEMO_MODE === 'true') {
    return new Response('Not available in demo mode', { status: 403 })
  }

  try {
    return await webhookCallback(bot, 'std/http')(req)
  } catch (err) {
    console.error('Webhook Error:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
