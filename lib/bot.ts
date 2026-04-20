import { mistral } from '@ai-sdk/mistral'
import { streamText, stepCountIs } from 'ai'
import { Bot } from 'grammy'
import { AI_CONFIG } from './ai/config'
import { tools } from './ai/tools'
import { getUserLocation, setUserLocation } from './googleSheets'

const token = process.env.TELEGRAM_BOT_TOKEN
const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_ID?.split(',').map(id => id.trim()) || []

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set')
}

export const bot = new Bot(token)

// Persistent store for user locations in Google Sheets
bot.on('message:location', async ctx => {
  const userId = ctx.from?.id.toString()
  if (!userId) return

  const coords = {
    lat: ctx.message.location.latitude,
    lng: ctx.message.location.longitude
  }

  await setUserLocation(userId, coords)

  await ctx.reply('Sipp bro, lokasimu udah tak catet! Sekarang kalo tanya jarak dari posisimu, langsung tak hitungin ya.')
})

bot.on('message:text', async ctx => {
  const userId = ctx.from?.id.toString()

  if (allowedUserIds.length > 0 && !allowedUserIds.includes(userId || '')) {
    console.warn(`Unauthorized access attempt from User ID: ${userId}`)
    return // Silently ignore unauthorized users
  }

  const prompt = ctx.message.text

  // Send typing indicator
  await ctx.replyWithChatAction('typing')

  const userLocation = userId ? await getUserLocation(userId) : null
  const locationContext = userLocation ? `\n\n[USER_CURRENT_LOCATION: ${userLocation.lat}, ${userLocation.lng}]` : ''

  try {
    const result = streamText({
      model: mistral(AI_CONFIG.model),
      system: AI_CONFIG.systemPrompt + locationContext,
      prompt: prompt,
      tools,
      stopWhen: stepCountIs(AI_CONFIG.maxSteps)
    })

    const text = await result.text
    if (text) {
      await ctx.reply(text, { parse_mode: 'Markdown' })
    }
  } catch (error) {
    console.error('Telegram Bot Error:', error)
    await ctx.reply('Aduh bro, ada error nih pas mau jawab. Coba lagi entar ya!')
  }
})
