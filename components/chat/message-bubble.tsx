'use client'

import { Bot, User, Loader2, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message, ToolPart } from '@/lib/types'
import { cn } from '@/lib/utils'

function ToolPartView({ part }: { part: ToolPart }) {
  const toolName = part.type.replace('tool-', '')

  // Specific loading messages
  const getStatusText = () => {
    switch (toolName) {
      case 'add_place': return 'Adding place to tracker…'
      case 'get_current_location': return 'Locating you…'
      case 'sync_all_distances': return 'Syncing distances from your location…'
      default: return 'Fetching your places…'
    }
  }

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted border border-border animate-fade-up">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
        <span className="text-xs text-muted-foreground">{getStatusText()}</span>
      </div>
    )
  }

  if (part.state === 'output-available') {
    const output = part.output
    
    // 1. Adding a place
    if (toolName === 'add_place') {
      const name = output?.entry?.name ?? 'place'
      return (
        <ToolResult icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}>
          Added "{name}" successfully
        </ToolResult>
      )
    }

    // 2. Getting current location
    if (toolName === 'get_current_location') {
      const address = output?.address || 'Unknown address'
      return (
        <ToolResult icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}>
          Located: {address}
        </ToolResult>
      )
    }

    // 3. Syncing distances
    if (toolName === 'sync_all_distances') {
      if (!output?.success) {
        return (
          <ToolResult icon={<CheckCircle2 className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}>
            No GPS — share your location first
          </ToolResult>
        )
      }
      const label = output?.updated
        ? `Updated distances for ${output.count} place${output.count !== 1 ? 's' : ''}`
        : 'Already up to date — you haven\'t moved more than 2km'
      return (
        <ToolResult icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}>
          {label}
        </ToolResult>
      )
    }

    // 3. Search/Retrieval tools (everything else)
    const count = output?.length ?? 0
    return (
      <ToolResult icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}>
        Found {count} place{count !== 1 ? 's' : ''}
      </ToolResult>
    )
  }

  return null
}

function ToolResult({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40 dark:border-emerald-500/20 animate-fade-up">
      {icon}
      <span className="text-xs text-emerald-700 dark:text-emerald-300">{children}</span>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-1.5 animate-fade-up', isUser ? 'items-end' : 'items-start')}>
      {/* Role label */}
      <div className={cn('flex items-center gap-1.5 opacity-50', isUser && 'flex-row-reverse')}>
        {isUser ? <User size={11} className="text-primary" /> : <Bot size={11} className="text-secondary" />}
        <span className="text-[10px] uppercase font-bold tracking-widest text-foreground">{isUser ? 'You' : 'Assistant'}</span>
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-relaxed transition-colors duration-300',
          isUser 
            ? 'bg-primary text-primary-foreground shadow-sm rounded-tr-none' 
            : 'glass text-foreground rounded-tl-none border-border'
        )}
      >
        <div className="flex flex-col gap-2">
          {message.parts ? (
            message.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <div key={i} className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{(part as { type: 'text'; text: string }).text}</ReactMarkdown>
                  </div>
                )
              }
              if (part.type.startsWith('tool-')) {
                return <ToolPartView key={i} part={part as ToolPart} />
              }
              return null
            })
          ) : (
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{message.content ?? ''}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
