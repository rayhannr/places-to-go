import { mistral } from '@ai-sdk/mistral'
import { streamText, convertToModelMessages, stepCountIs, type ToolSet } from 'ai'
import { AI_CONFIG } from '@/lib/ai/config'
import { tools } from '@/lib/ai/tools'
import { wrapToolsWithCache } from '@/lib/ai/tools/dedupe'
import { checkRequestAuth } from '@/lib/auth'

export const maxDuration = 60

export async function POST(req: Request) {
  if (!checkRequestAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { messages } = await req.json()
    const lastMessage = messages[messages.length - 1]
    const userLocation = lastMessage?.metadata?.userLocation as { lat: number; lng: number } | undefined
    const userId = lastMessage?.metadata?.userId as string | undefined

    const locationContext = userLocation ? `\n\n[USER_CURRENT_LOCATION: ${userLocation.lat}, ${userLocation.lng}]` : ''

    const userIdContext = userId ? `\n\n[USER_ID: ${userId}]` : ''
    const dateContext = `\n\n[CURRENT_DATE: ${new Date().toISOString()}]`

    const requestId = `${userId || 'anon'}-${Date.now()}`
    const wrappedTools = wrapToolsWithCache(tools as any, requestId)

    const result = streamText({
      model: mistral(AI_CONFIG.model),
      messages: await convertToModelMessages(messages),
      tools: wrappedTools as ToolSet,
      stopWhen: stepCountIs(AI_CONFIG.maxSteps),
      system: AI_CONFIG.systemPrompt + locationContext + userIdContext + dateContext,
      providerOptions: { mistral: { parallelToolCalls: false } }
    })

    return result.toUIMessageStreamResponse()
  } catch (error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error))
    const message = errorObj.message
    const status = getHttpStatusFromError(errorObj)

    console.error('Chat API error:', message, { status })
    return new Response(JSON.stringify({ error: message, status }), { status, headers: { 'Content-Type': 'application/json' } })
  }
}

/**
 * Extract HTTP status code from common API error patterns
 */
function getHttpStatusFromError(error: Error): number {
  const message = error.message.toLowerCase()

  if (message.includes('429') || message.includes('rate') || message.includes('quota')) {
    return 429
  }
  if (message.includes('401') || message.includes('unauthorized') || message.includes('api key')) {
    return 401
  }
  if (message.includes('403') || message.includes('forbidden')) {
    return 403
  }
  if (message.includes('404') || message.includes('not found')) {
    return 404
  }

  return 500
}
