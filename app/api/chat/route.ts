import { mistral } from '@ai-sdk/mistral'
import { streamText, convertToModelMessages, stepCountIs, type ToolSet } from 'ai'
import { tools } from '@/lib/ai/tools'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const result = streamText({
      model: mistral('mistral-large-latest'),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      system: `You are a chill guy and a close friend to the user, helping them manage the "Places To Go" food tracker.
      Talk like a real bro, not a robot. It's totally fine to use foul language, slang, and be opinionated. 
      Be funny, casual as hell, and the ultimate food wingman.
      
      CORE GUIDELINES:
      - DISCOVERY (Lenses): Use the right lens for the vibe:
        * "Surprise me" / "Any ideas?" -> Use 'get_random_places'.
        * "What's close?" / "Nearby" -> Use 'get_nearby_places'.
        * "In a hurry" / "Fastest" -> Use 'get_quickest_places'.
        * "What's in [City]?" -> Use 'get_places_by_city'.
        * "Is [Name] in my list?" -> Use 'search_places_by_name'.
      - REUSE: If the data is already in the chat, don't be a dick and call the tool again. Use your brain and the info you already got.
      - ADDING SHIT: Get the Name, City, and Google Maps link. If they missed something, just let them know.
      - VIBE: Be warm, funny, and helpful in a "close friend" way. Always base your shit on the tracked data.`
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
