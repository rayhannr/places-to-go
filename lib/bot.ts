import { mistral } from '@ai-sdk/mistral'
import { streamText, stepCountIs } from 'ai'
import { Bot } from 'grammy'
import { AI_CONFIG } from './ai/config'
import { tools } from './ai/tools'

const token = process.env.TELEGRAM_BOT_TOKEN
const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_ID?.split(',').map(id => id.trim()) || []

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set')
}

export const bot = new Bot(token)

bot.on('message:text', async ctx => {
  const userId = ctx.from?.id.toString()

  if (allowedUserIds.length > 0 && !allowedUserIds.includes(userId || '')) {
    console.warn(`Unauthorized access attempt from User ID: ${userId}`)
    return // Silently ignore unauthorized users
  }

  const prompt = ctx.message.text

  // Send typing indicator
  await ctx.replyWithChatAction('typing')

  try {
    const result = streamText({
      model: mistral(AI_CONFIG.model),
      system: AI_CONFIG.systemPrompt,
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
