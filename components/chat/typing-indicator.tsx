'use client'

import { Bot } from 'lucide-react'

export function TypingIndicator() {
  return (
    <div className="flex flex-col items-start gap-1.5 animate-fade-up">
      <div className="flex items-center gap-1.5 opacity-50">
        <Bot size={11} className="text-secondary" />
        <span className="text-[10px] uppercase font-bold tracking-widest text-foreground">Assistant</span>
      </div>
      <div className="glass px-5 py-3.5 rounded-2xl rounded-tl-none border-border">
        <div className="flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-blink [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-blink [animation-delay:200ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-blink [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  )
}
