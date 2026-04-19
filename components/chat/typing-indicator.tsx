'use client'

import { Bot } from 'lucide-react'

export function TypingIndicator() {
  return (
    <div className="flex flex-col items-start gap-1.5 animate-fade-up">
      <div className="flex items-center gap-1.5 opacity-40">
        <Bot size={11} />
        <span className="text-[10px] uppercase font-semibold tracking-widest animate-blink text-blue-400">Thinking…</span>
      </div>
      <div className="glass px-5 py-3.5 rounded-2xl rounded-tl-none">
        <div className="flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-blink [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-blink [animation-delay:200ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-blink [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  )
}
