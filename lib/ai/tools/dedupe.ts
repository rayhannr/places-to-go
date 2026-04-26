
import { CoreTool } from 'ai'

/**
 * Tool execution cache to ensure idempotency within a single request or across retries.
 * In a serverless environment, this persists as long as the lambda instance is warm.
 */
const toolExecutionCache = new Map<string, any>()

/**
 * Wraps a set of tools with a caching layer.
 * @param tools The tools to wrap
 * @param requestId A unique ID for the current request (e.g., Telegram updateId or a UUID)
 * @returns Wrapped tools that cache results based on name and arguments
 */
export function wrapToolsWithCache(tools: Record<string, CoreTool<any, any>>, requestId: string | number) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: tool.execute 
          ? async (args: any, options: any) => {
              const cacheKey = `${requestId}:${name}:${JSON.stringify(args)}`
              
              if (toolExecutionCache.has(cacheKey)) {
                console.log(`[Tool Cache] Returning cached result for ${name} (Req: ${requestId})`)
                return toolExecutionCache.get(cacheKey)
              }
              
              const result = await tool.execute!(args, options)
              toolExecutionCache.set(cacheKey, result)

              // Manage cache size
              if (toolExecutionCache.size > 1000) {
                const firstKey = toolExecutionCache.keys().next().value
                if (firstKey) toolExecutionCache.delete(firstKey)
              }

              return result
            }
          : undefined
      }
    ])
  )
}
