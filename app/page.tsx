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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelOfPlaces } from '@/components/wheel-of-places'
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
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('places_user_id')
      if (!id) {
        id = Math.random().toString(36).substring(2, 15)
        localStorage.setItem('places_user_id', id)
      }
      userIdRef.current = id
    }
  }, [])

  const isLoading = status !== 'ready' && status !== 'error'
  const typedMessages = messages as Message[]

  const handleSendMessage = (text: string) => {
    sendMessage({
      text,
      metadata: {
        userLocation: coordsRef.current,
        userId: userIdRef.current
      }
    })
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const showTyping = isLoading && status !== 'streaming'

  // Helper to keep tab triggers completely DRY
  const getTriggerClass = (tabColor: 'blue' | 'violet') => {
    const activeStyles =
      tabColor === 'blue'
        ? 'data-active:bg-blue-500/10 data-active:border-blue-500/30 data-active:text-blue-400 data-active:shadow-[0_0_12px_rgba(59,130,246,0.18)]'
        : 'data-active:bg-violet-500/10 data-active:border-violet-500/30 data-active:text-violet-400 data-active:shadow-[0_0_12px_rgba(139,92,246,0.18)]'

    return `py-1.5 text-[10px] font-extrabold uppercase tracking-wider ${activeStyles}`
  }

  return (
    <main className="flex flex-col h-screen max-w-2xl mx-auto w-full px-4 py-5 md:px-6 md:py-6">
      <ChatHeader onLocationClick={handleRequestLocation} />

      <Tabs defaultValue="chat" className="flex flex-col flex-1 min-h-0">
        <TabsList className="grid grid-cols-2 p-1 bg-zinc-950/20 border border-zinc-800/40 rounded-xl mb-5 max-w-xs mx-auto w-full glass shrink-0 select-none">
          <TabsTrigger value="chat" className={getTriggerClass('blue')}>
            💬 Roast Chat
          </TabsTrigger>
          <TabsTrigger value="wheel" className={getTriggerClass('violet')}>
            🎡 Place Wheel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 outline-none">
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
        </TabsContent>

        <TabsContent value="wheel" className="flex flex-col flex-1 min-h-0 outline-none">
          <ScrollArea className="flex-1 mb-1 pr-1">
            <div className="pb-3">
              <WheelOfPlaces />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-center mt-3 text-muted-foreground/40 uppercase tracking-[0.2em] shrink-0">Powered by Mistral AI</p>
    </main>
  )
}
