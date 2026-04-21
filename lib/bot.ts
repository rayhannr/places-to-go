import { mistral } from '@ai-sdk/mistral'
import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { Bot } from 'grammy'
import { AI_CONFIG } from './ai/config'
import { tools } from './ai/tools'
import { getChatSession, saveChatSession } from './googleSheets'

const token = process.env.TELEGRAM_BOT_TOKEN
const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_ID?.split(',').map(id => id.trim()) || []

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set')
}

export const bot = new Bot(token)

// Persistent store for user locations in Google Sheets
bot.on(['message:location', 'edited_message:location'], async ctx => {
  const userId = ctx.from?.id.toString()
  if (!userId) return

  const location = ctx.message?.location || ctx.editedMessage?.location
  if (!location) return

  const coords = {
    lat: location.latitude,
    lng: location.longitude
  }

  await saveChatSession(userId, { lat: coords.lat, lng: coords.lng })

  // Only reply for initial share, not every live update
  if (ctx.message) {
    await ctx.reply('Sipp bro, lokasimu udah tak catet! Sekarang kalo tanya jarak dari posisimu, langsung tak hitungin ya.')
  }
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

  const { lat, lng, history } = userId ? await getChatSession(userId) : { lat: null, lng: null, history: [] }
  const locationContext = lat && lng ? `\n\n[USER_CURRENT_LOCATION: ${lat}, ${lng}]` : ''
  const userIdContext = userId ? `\n\n[USER_ID: ${userId}]` : ''

  // Build messages array with history
  const messages: ModelMessage[] = [...(history as ModelMessage[]), { role: 'user', content: prompt }]

  try {
    const result = await generateText({
      model: mistral(AI_CONFIG.model),
      system: AI_CONFIG.systemPrompt + locationContext + userIdContext,
      messages,
      tools,
      stopWhen: stepCountIs(AI_CONFIG.maxSteps)
    })

    const text = result.text
    if (text) {
      await ctx.reply(text, { parse_mode: 'Markdown' })
    }

    // Persist history (limit to last 10 messages to keep sheet size manageable)
    if (userId) {
      const fullHistory = result.response.messages
      const limitedHistory = fullHistory.slice(-10)
      await saveChatSession(userId, { history: limitedHistory })
    }
  } catch (error) {
    console.error('Telegram Bot Error:', error)
    await ctx.reply('Aduh bro, ada error nih pas mau jawab. Coba lagi entar ya!')
  }
})
