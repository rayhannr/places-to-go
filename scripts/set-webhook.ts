import { Bot } from 'grammy'

async function setWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.argv[2] || process.env.WEBHOOK_URL

  if (!token) {
    console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment.')
    process.exit(1)
  }

  if (!url) {
    console.error('Usage: npx tsx scripts/set-webhook.ts <your-vercel-url>')
    console.error('Or set WEBHOOK_URL in your .env file.')
    console.error('Example: npx tsx scripts/set-webhook.ts https://your-app.vercel.app/api/telegram')
    process.exit(1)
  }

  const bot = new Bot(token)
  
  try {
    console.log(`Setting webhook to: ${url}...`)
    await bot.api.setWebhook(url)
    console.log('✅ Webhook set successfully!')
  } catch (err) {
    console.error('❌ Failed to set webhook:', err)
  }
}

setWebhook()
