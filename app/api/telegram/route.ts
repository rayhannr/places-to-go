import { webhookCallback } from 'grammy'
import { bot } from '@/lib/bot'

export const dynamic = 'force-dynamic'

const handleUpdate = webhookCallback(bot, 'std/http')

export async function POST(req: Request) {
  try {
    return await handleUpdate(req)
  } catch (err) {
    console.error('Webhook Error:', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
