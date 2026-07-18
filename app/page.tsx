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
import { LockScreen } from '@/components/lock-screen'
import { MessageBubble } from '@/components/chat/message-bubble'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelOfPlaces } from '@/components/wheel-of-places'
import { useAppAuth } from '@/hooks/use-app-auth'
import { TOOL_METADATA } from '@/lib/ai/tools/metadata'
import { Message } from '@/lib/types'
import { cn } from '@/lib/utils'

const MUTATING_TOOLS = new Set(
  Object.entries(TOOL_METADATA).filter(([, meta]) => meta.mutating).map(([name]) => name)
)

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement>(null)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'wheel'>('chat')
  const queryClient = useQueryClient()

  const { isAuthLoading, isLocked, passwordRef, unlock } = useAppAuth()

  const transport = useRef(new DefaultChatTransport({
    api: '/api/chat',
    headers: (): Record<string, string> => passwordRef.current ? { 'x-app-password': passwordRef.current } : {}
  })).current

  const { messages, sendMessage, status, error } = useChat({ transport })
  const userIdRef = useRef<string | null>(null)
  const lastErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (tabParam === 'chat' || tabParam === 'wheel') setActiveTab(tabParam)
    }
    setMounted(true)
  }, [])

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

  useEffect(() => {
    if (!error) return
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (lastErrorRef.current === errorMessage) return
    lastErrorRef.current = errorMessage

    if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      toast.error("Chill the fuck out, you're spamming me. Try again in a sec.")
    } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
      window.dispatchEvent(new Event('auth-failed'))
    } else if (errorMessage.includes('500') || errorMessage.includes('server error')) {
      toast.error('Shit broke on my end. Try again in a bit.')
    } else {
      toast.error(`Something broke: ${errorMessage}`)
    }
  }, [error])

  const isLoading = status !== 'ready' && status !== 'error'
  const typedMessages = messages as Message[]
  const wasLoadingRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    const justFinished = wasLoadingRef.current && !isLoading
    if (justFinished) {
      const lastAssistant = [...typedMessages].reverse().find(m => m.role === 'assistant')
      const usedMutatingTool = lastAssistant?.parts?.some(
        part => part.type.startsWith('tool-') && MUTATING_TOOLS.has(part.type.replace('tool-', ''))
      )
      if (usedMutatingTool) queryClient.invalidateQueries({ queryKey: ['places'] })
    }
    wasLoadingRef.current = isLoading
  }, [isLoading, typedMessages, queryClient])

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
          toast.success("Got your location. Try not to get lost.")
        },
        err => {
          console.warn('Geolocation error:', err)
          toast.error("Couldn't find you. Phone's being difficult, or you are.")
        },
        { enableHighAccuracy: true }
      )
    }
  }

  const handleSendMessage = (text: string) => {
    sendMessage({ text, metadata: { userLocation: coordsRef.current, userId: userIdRef.current } })
  }

  const getTriggerClass = (tabColor: 'blue' | 'violet') => cn(
    'h-full py-0 text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center transition-all duration-200',
    tabColor === 'blue'
      ? 'data-active:bg-blue-50 dark:data-active:bg-blue-500/10 data-active:border-blue-200 dark:data-active:border-blue-500/30 data-active:text-blue-600 dark:data-active:text-blue-400 data-active:shadow-[0_2px_8px_rgba(59,130,246,0.08)] dark:data-active:shadow-[0_0_12px_rgba(59,130,246,0.18)]'
      : 'data-active:bg-violet-50 dark:data-active:bg-violet-500/10 data-active:border-violet-200 dark:data-active:border-violet-500/30 data-active:text-violet-600 dark:data-active:text-violet-400 data-active:shadow-[0_2px_8px_rgba(139,92,246,0.08)] dark:data-active:shadow-[0_0_12px_rgba(139,92,246,0.18)]'
  )

  if (isAuthLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
      </div>
    )
  }

  if (isLocked) return <LockScreen onUnlock={unlock} />

  const showTyping = isLoading && status !== 'streaming'

  return (
    <main className="flex flex-col h-screen max-w-2xl mx-auto w-full px-4 py-5 md:px-6 md:py-6 overflow-hidden">
      <ChatHeader onLocationClick={handleRequestLocation} />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <TabsList className="grid grid-cols-2 h-10 p-1 rounded-xl mb-5 max-w-xs mx-auto w-full glass shrink-0 select-none">
          <TabsTrigger value="chat" className={getTriggerClass('blue')}>💬 Chat</TabsTrigger>
          <TabsTrigger value="wheel" className={getTriggerClass('violet')}>🎡 Place Wheel</TabsTrigger>
        </TabsList>

        {mounted ? (
          <>
            <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 outline-none animate-fade-in overflow-hidden">
              <ScrollArea className="flex-1 mb-4 pr-1 min-h-0">
                <div className="flex flex-col gap-5 pb-2">
                  {typedMessages.length === 0 && <EmptyState onAction={handleSendMessage} disabled={isLoading} />}
                  {typedMessages.map(m => <MessageBubble key={m.id} message={m} />)}
                  {showTyping && <TypingIndicator />}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="wheel" className="flex flex-col flex-1 min-h-0 outline-none animate-fade-in overflow-hidden">
              <ScrollArea className="flex-1 mb-1 pr-1 min-h-0">
                <div className="pb-3"><WheelOfPlaces /></div>
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
