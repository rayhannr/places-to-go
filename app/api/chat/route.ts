import { mistral } from '@ai-sdk/mistral'
import { streamText, convertToModelMessages, stepCountIs, type ToolSet } from 'ai'
import { tools } from '@/lib/ai/tools'
import { AI_CONFIG } from '@/lib/ai/config'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const result = streamText({
      model: mistral(AI_CONFIG.model),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(AI_CONFIG.maxSteps),
      system: AI_CONFIG.systemPrompt
    })

    return result.toUIMessageStreamResponse()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Chat API error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
