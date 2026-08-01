import { Command } from 'commander'
import type { ToolSet } from 'ai'
import { tools } from '../lib/ai/tools'
import { wrapToolsWithRateLimit } from '../lib/ai/tools/rate-limit'
import { TOOL_METADATA } from '../lib/ai/tools/metadata'
import { addOptionsFromSchema, optionsToToolArgs } from './schema'
import { printResult } from './format'

const wrappedTools = wrapToolsWithRateLimit(tools as any, 'cli') as ToolSet

/** Registers one Commander subcommand per AI tool, calling its execute() directly. */
export function registerToolCommands(program: Command): void {
  for (const [name, tool] of Object.entries(wrappedTools)) {
    if (!tool.inputSchema || !('shape' in (tool.inputSchema as any))) continue

    const meta = TOOL_METADATA[name]
    const cmd = program.command(toCommandName(name)).description(meta?.blurb ?? tool.description ?? name)

    addOptionsFromSchema(cmd, tool.inputSchema as any)

    cmd.action(async opts => {
      const args = optionsToToolArgs(opts, tool.inputSchema as any)
      try {
        const result = await tool.execute!(args, { toolCallId: 'cli', messages: [] })
        printResult(result)
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : String(err))
        process.exitCode = 1
      }
    })
  }
}

function toCommandName(toolName: string): string {
  return toolName.replace(/_/g, '-')
}
