'use client'

import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface ChatInputProps {
  onSendMessage: (text: string) => void
  isLoading?: boolean
}

export function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const value = draft.trim()
    if (!value || isLoading) return
    onSendMessage(value)
    setDraft('')
  }

  return (
    <form
      id="chat-form"
      onSubmit={e => {
        e.preventDefault()
        submit()
      }}
      className="relative flex items-center gap-2 shrink-0 animate-fade-up"
    >
      <Input
        id="chat-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        autoFocus
        placeholder="Ask about your favorite places…"
        disabled={isLoading}
        className="flex-1 glass border-border text-foreground text-sm placeholder:text-muted-foreground focus-visible:ring-primary/50 focus-visible:border-primary/40 rounded-xl h-12 px-4 transition-all"
      />
      <Button
        id="chat-submit"
        type="submit"
        size="icon"
        disabled={isLoading || !draft.trim()}
        className="h-12 w-12 rounded-xl bg-primary text-primary-foreground hover:opacity-90 glow-primary disabled:opacity-40 disabled:grayscale shrink-0 active:scale-95 transition-all cursor-pointer border-none"
      >
        {isLoading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Send className="w-4.5 h-4.5" />}
      </Button>
    </form>
  )
}
