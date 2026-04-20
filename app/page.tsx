'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ChatHeader } from '@/components/chat/chat-header'
import { ChatInput } from '@/components/chat/chat-input'
import { EmptyState } from '@/components/chat/empty-state'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Message } from '@/lib/types'

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement>(null)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)

  const handleRequestLocation = () => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          toast.success('Nice, sekarang gue tau lokasi lu!')
        },
        err => {
          console.warn('Geolocation error:', err)
          toast.error('Gagal ambil lokasi nih, bro.')
        },
        { enableHighAccuracy: true }
      )
    }
  }

  const { messages, sendMessage, status } = useChat({ transport: new DefaultChatTransport({ api: '/api/chat' }) })

  const isLoading = status !== 'ready' && status !== 'error'
  const typedMessages = messages as Message[]

  const handleSendMessage = (text: string) => {
    sendMessage({
      text,
      metadata: { userLocation: coordsRef.current }
    })
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const showTyping = isLoading && status !== 'streaming'

  return (
    <main className="flex flex-col h-screen max-w-2xl mx-auto w-full px-4 py-5 md:px-6 md:py-6">
      <ChatHeader onLocationClick={handleRequestLocation} />

      {/* ── Messages ── */}
      <ScrollArea className="flex-1 mb-4 pr-1">
        <div className="flex flex-col gap-5 pb-2">
          {/* Empty state */}
          {typedMessages.length === 0 && <EmptyState onAction={handleSendMessage} disabled={isLoading} />}

          {/* Message list */}
          {typedMessages.map(m => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {/* Typing indicator */}
          {showTyping && <TypingIndicator />}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* ── Input bar ── */}
      <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />

      <p className="text-[10px] text-center mt-3 text-muted-foreground/40 uppercase tracking-[0.2em] shrink-0">Powered by Mistral AI</p>
    </main>
  )
}
