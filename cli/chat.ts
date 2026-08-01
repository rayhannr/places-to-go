import readline from 'node:readline/promises'
import { mistral } from '@ai-sdk/mistral'
import { streamText, stepCountIs, type ModelMessage, type ToolSet } from 'ai'
import { AI_CONFIG } from '../lib/ai/config'
import { tools } from '../lib/ai/tools'
import { wrapToolsWithRateLimit } from '../lib/ai/tools/rate-limit'

/** Terminal chat REPL — same persona/tools as the web and Telegram front ends. */
export async function runChat(): Promise<void> {
  if (!process.env.MISTRAL_API_KEY) {
    console.error('MISTRAL_API_KEY is not set. Chat mode needs it to talk to Mistral AI.')
    process.exitCode = 1
    return
  }

  const wrappedTools = wrapToolsWithRateLimit(tools as any, 'cli-chat') as ToolSet
  const messages: ModelMessage[] = []
  const dateContext = `\n\n[CURRENT_DATE: ${new Date().toISOString()}]`

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log('Places To Go — chat mode. Ctrl+C or "exit" to quit.\n')

  while (true) {
    const input = await rl.question('you> ')
    if (['exit', 'quit'].includes(input.trim().toLowerCase())) break
    if (!input.trim()) continue

    messages.push({ role: 'user', content: input })

    const result = streamText({
      model: mistral(AI_CONFIG.model),
      messages,
      tools: wrappedTools,
      stopWhen: stepCountIs(AI_CONFIG.maxSteps),
      system: AI_CONFIG.systemPrompt + dateContext,
      providerOptions: { mistral: { parallelToolCalls: false } }
    })

    process.stdout.write('bot> ')
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text)
      } else if (chunk.type === 'tool-call') {
        process.stdout.write(`\n  [running ${chunk.toolName}...]\n`)
      } else if (chunk.type === 'error') {
        console.error('\nError:', chunk.error)
      }
    }
    console.log('\n')

    messages.push(...(await result.response).messages)
  }

  rl.close()
}
