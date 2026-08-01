import { Command, Option } from 'commander'
import { z } from 'zod'

interface JsonSchemaProp {
  type?: string
  description?: string
  default?: unknown
  enum?: string[]
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

interface JsonSchemaObject {
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

/**
 * Google Maps link/coordinate style flags get mapped onto the tool's
 * `userLocation: { lat, lng }` object param so the CLI doesn't force
 * users to pass raw JSON.
 */
const LOCATION_PROP = 'userLocation'

/** Adds one Commander option per top-level scalar field in a tool's Zod inputSchema. */
export function addOptionsFromSchema(cmd: Command, inputSchema: z.ZodTypeAny): void {
  const schema = z.toJSONSchema(inputSchema) as JsonSchemaObject
  const required = new Set(schema.required ?? [])
  const properties = schema.properties ?? {}

  for (const [key, prop] of Object.entries(properties)) {
    if (key === LOCATION_PROP) {
      cmd.option('--lat <number>', 'User current latitude (for live distance)', parseFloat)
      cmd.option('--lng <number>', 'User current longitude (for live distance)', parseFloat)
      continue
    }

    const flag = toFlag(key)
    const isRequired = required.has(key) && prop.default === undefined
    const descParts = [prop.description ?? key]
    if (prop.enum) descParts.push(`(${prop.enum.join('|')})`)
    if (prop.default !== undefined) descParts.push(`[default: ${JSON.stringify(prop.default)}]`)
    const description = descParts.join(' ')

    if (prop.type === 'boolean') {
      cmd.option(`--${flag}`, description)
      continue
    }

    const option = new Option(`--${flag} <value>`, description)
    if (prop.enum) option.choices(prop.enum)
    if (prop.type === 'number') option.argParser(parseFloat)
    if (isRequired) option.makeOptionMandatory()
    cmd.addOption(option)
  }
}

/** Reconstructs the tool's execute() args object from parsed Commander options. */
export function optionsToToolArgs(opts: Record<string, unknown>, inputSchema: z.ZodTypeAny): Record<string, unknown> {
  const schema = z.toJSONSchema(inputSchema) as JsonSchemaObject
  const properties = schema.properties ?? {}
  const args: Record<string, unknown> = {}

  for (const key of Object.keys(properties)) {
    if (key === LOCATION_PROP) {
      if (opts.lat !== undefined && opts.lng !== undefined) {
        args[key] = { lat: opts.lat, lng: opts.lng }
      }
      continue
    }
    if (opts[key] !== undefined) {
      args[key] = opts[key]
    }
  }

  return args
}

function toFlag(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}
