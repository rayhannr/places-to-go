import { mistral } from "@ai-sdk/mistral";
import { streamText, convertToModelMessages, stepCountIs, type ToolSet } from "ai";
// tools.js uses the AI SDK v6 `parameters` convention (JS); cast to ToolSet for TS
import { tools as rawTools } from "@/lib/ai/tools";

const tools = rawTools as unknown as ToolSet;

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const result = streamText({
      model: mistral("mistral-large-latest"),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      system: `You are a friendly and knowledgeable assistant for the "Places To Go" food tracker.
      Your job is to help users manage their personal list of food destinations.
      
      When recommending places, always call the recommend_place tool first, then curate your response based on the user's preferences (city, cuisine type, distance, etc.).
      When adding a place, collect the name, city, and a Google Maps link from the user — ask for missing details politely.
      Always base your final response on the tool results. Be concise but warm.`,
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Chat API error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
