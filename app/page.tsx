'use client'

import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { cn } from '@/lib/utils'

// Tools that mutate the Google Sheets data — only these warrant a cache invalidation
const MUTATING_TOOLS = new Set(['add_place', 'visit_place', 'delete_place'])

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement>(null)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'wheel'>('chat')
  const queryClient = useQueryClient()

  // Sync tab from query param on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (tabParam === 'chat' || tabParam === 'wheel') {
        setActiveTab(tabParam)
      }
    }
    setMounted(true)
  }, [])

  // Update query param when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'chat' | 'wheel')
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      params.set('tab', value)
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
    }
  }

  const handleRequestLocation = () => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          toast.success('Sweet, got your location, fam!')
        },
        err => {
          console.warn('Geolocation error:', err)
          toast.error("Bummer, couldn't snag your spot, dude.")
        },
        { enableHighAccuracy: true }
      )
    }
  }

  const { messages, sendMessage, status, error } = useChat({ transport: new DefaultChatTransport({ api: '/api/chat' }) })
  const userIdRef = useRef<string | null>(null)
  const lastErrorRef = useRef<string | null>(null)

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

  // Show error toast when API returns an error
  useEffect(() => {
    if (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // Avoid showing duplicate errors
      if (lastErrorRef.current !== errorMessage) {
        lastErrorRef.current = errorMessage

        // User-friendly error messages for known errors
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
          toast.error('Rate limited! The AI is getting too many requests. Try again in a moment.')
        } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
          toast.error('Authentication failed. Check your API keys.')
        } else if (errorMessage.includes('500') || errorMessage.includes('server error')) {
          toast.error('Server error. The AI service might be down. Try again soon.')
        } else {
          toast.error(`Oops! ${errorMessage}`)
        }
      }
    }
  }, [error])

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

  // ── Smart cache invalidation ──────────────────────────────────────────────
  // Track the previous loading state so we can detect the transition
  // from "loading" → "ready", which signals the AI turn just finished.
  const wasLoadingRef = useRef(false)

  useEffect(() => {
    const justFinished = wasLoadingRef.current && !isLoading

    if (justFinished) {
      // Find the last assistant message and check if it used any mutating tools
      const lastAssistant = [...typedMessages].reverse().find(m => m.role === 'assistant')
      const usedMutatingTool = lastAssistant?.parts?.some(
        part => part.type.startsWith('tool-') && MUTATING_TOOLS.has(part.type.replace('tool-', ''))
      )

      if (usedMutatingTool) {
        queryClient.invalidateQueries({ queryKey: ['places'] })
      }
    }

    wasLoadingRef.current = isLoading
  }, [isLoading, typedMessages, queryClient])

  const showTyping = isLoading && status !== 'streaming'

  // Helper to keep tab triggers completely DRY
  const getTriggerClass = (tabColor: 'blue' | 'violet') => {
    return cn(
      'h-full py-0 text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center transition-all duration-200',
      tabColor === 'blue'
        ? 'data-active:bg-blue-50 dark:data-active:bg-blue-500/10 data-active:border-blue-200 dark:data-active:border-blue-500/30 data-active:text-blue-600 dark:data-active:text-blue-400 data-active:shadow-[0_2px_8px_rgba(59,130,246,0.08)] dark:data-active:shadow-[0_0_12px_rgba(59,130,246,0.18)]'
        : 'data-active:bg-violet-50 dark:data-active:bg-violet-500/10 data-active:border-violet-200 dark:data-active:border-violet-500/30 data-active:text-violet-600 dark:data-active:text-violet-400 data-active:shadow-[0_2px_8px_rgba(139,92,246,0.08)] dark:data-active:shadow-[0_0_12px_rgba(139,92,246,0.18)]'
    )
  }

  return (
    <main className="flex flex-col h-screen max-w-2xl mx-auto w-full px-4 py-5 md:px-6 md:py-6 overflow-hidden">
      <ChatHeader onLocationClick={handleRequestLocation} />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <TabsList className="grid grid-cols-2 h-10 p-1 rounded-xl mb-5 max-w-xs mx-auto w-full glass shrink-0 select-none">
          <TabsTrigger value="chat" className={getTriggerClass('blue')}>
            💬 Chat
          </TabsTrigger>
          <TabsTrigger value="wheel" className={getTriggerClass('violet')}>
            🎡 Place Wheel
          </TabsTrigger>
        </TabsList>

        {mounted ? (
          <>
            <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 outline-none animate-fade-in overflow-hidden">
              {/* ── Messages ── */}
              <ScrollArea className="flex-1 mb-4 pr-1 min-h-0">
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

            <TabsContent value="wheel" className="flex flex-col flex-1 min-h-0 outline-none animate-fade-in overflow-hidden">
              <ScrollArea className="flex-1 mb-1 pr-1 min-h-0">
                <div className="pb-3">
                  <WheelOfPlaces />
                </div>
              </ScrollArea>
            </TabsContent>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
          </div>
        )}
      </Tabs>
    </main>
  )
}
