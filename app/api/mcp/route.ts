import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { AI_CONFIG } from '@/lib/ai/config'
import { tools } from '@/lib/ai/tools'
import { checkRequestAuth } from '@/lib/auth'

const DEMO_MODE = process.env.DEMO_MODE === 'true'

function createMcpServer() {
  const server = new McpServer(
    { name: 'places-to-go', version: '1.0.0' },
    { instructions: AI_CONFIG.systemPrompt }
  )

  for (const [name, toolDef] of Object.entries(tools)) {
    if (!toolDef.execute) continue

    const execute = toolDef.execute
    server.registerTool(
      name,
      {
        description: toolDef.description ?? '',
        inputSchema: toolDef.inputSchema as any
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await execute(args as any, { messages: [], toolCallId: 'mcp' })
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return { content: [{ type: 'text' as const, text: message }], isError: true }
        }
      }
    )
  }

  return server
}

async function handleMcpRequest(req: Request): Promise<Response> {
  if (!checkRequestAuth(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  })
  const server = createMcpServer()
  await server.connect(transport)
  return transport.handleRequest(req)
}

const demoModeResponse = () =>
  Response.json({ error: 'MCP is disabled in demo mode' }, { status: 403 })

export async function GET(req: Request) {
  if (DEMO_MODE) return demoModeResponse()
  return handleMcpRequest(req)
}

export async function POST(req: Request) {
  if (DEMO_MODE) return demoModeResponse()
  return handleMcpRequest(req)
}

export async function DELETE(req: Request) {
  if (DEMO_MODE) return demoModeResponse()
  return handleMcpRequest(req)
}
