import { mistral } from '@ai-sdk/mistral'
import { streamText, convertToModelMessages, stepCountIs, type ToolSet } from 'ai'
import { tools } from '@/lib/ai/tools'
import { wrapToolsWithCache } from '@/lib/ai/tools/dedupe'
import { AI_CONFIG } from '@/lib/ai/config'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
    const lastMessage = messages[messages.length - 1]
    const userLocation = lastMessage?.metadata?.userLocation as { lat: number; lng: number } | undefined
    const userId = lastMessage?.metadata?.userId as string | undefined

    const locationContext = userLocation 
      ? `\n\n[USER_CURRENT_LOCATION: ${userLocation.lat}, ${userLocation.lng}]` 
      : ''
    
    const userIdContext = userId ? `\n\n[USER_ID: ${userId}]` : ''
    const dateContext = `\n\n[CURRENT_DATE: ${new Date().toISOString()}]`

    const requestId = `${userId || 'anon'}-${Date.now()}`
    const wrappedTools = wrapToolsWithCache(tools as any, requestId)

    const result = streamText({
      model: mistral(AI_CONFIG.model),
      messages: await convertToModelMessages(messages),
      tools: wrappedTools as ToolSet,
      stopWhen: stepCountIs(AI_CONFIG.maxSteps),
      system: AI_CONFIG.systemPrompt + locationContext + userIdContext + dateContext
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
