'use client'

import { Bot, User, Loader2, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message, ToolPart } from '@/lib/types'
import { cn } from '@/lib/utils'

function ToolPartView({ part }: { part: ToolPart }) {
  const toolName = part.type.replace('tool-', '')
  const isSearch = toolName !== 'add_place'

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-black/30 border border-white/5 animate-fade-up">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
        <span className="text-xs text-zinc-400">{isSearch ? 'Fetching your places…' : 'Adding place to tracker…'}</span>
      </div>
    )
  }

  if (part.state === 'output-available') {
    const count = (part.output as { length?: number } | undefined)?.length
    const name = (part.output as { entry?: { name?: string } } | undefined)?.entry?.name
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 animate-fade-up">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs text-emerald-300">
          {isSearch ? `Found ${count ?? 0} place${count !== 1 ? 's' : ''}` : `Added "${name ?? 'place'}" successfully`}
        </span>
      </div>
    )
  }

  return null
}

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-1.5 animate-fade-up', isUser ? 'items-end' : 'items-start')}>
      {/* Role label */}
      <div className={cn('flex items-center gap-1.5 opacity-40', isUser && 'flex-row-reverse')}>
        {isUser ? <User size={11} /> : <Bot size={11} />}
        <span className="text-[10px] uppercase font-semibold tracking-widest">{isUser ? 'You' : 'Assistant'}</span>
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
          isUser ? 'bg-blue-600/20 border border-blue-500/30 text-blue-50 rounded-tr-none' : 'glass text-zinc-100 rounded-tl-none'
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
