export type ToolPart = {
  type: string
  state: string
  output?: { length?: number; entry?: { name?: string }; address?: string; success?: boolean; updated?: boolean; count?: number } | null
}

export type MessagePart = { type: 'text'; text: string } | ToolPart

export type Message = {
  id: string
  role: 'user' | 'assistant'
  parts?: MessagePart[]
  content?: string
}
