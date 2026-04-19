'use client'

import { ChefHat } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'

export function ChatHeader() {
  return (
    <header className="flex items-center justify-between mb-6 animate-fade-up shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl glass flex items-center justify-center glow-primary">
          <ChefHat className="text-blue-400 w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Places To Go</h1>
          <p className="text-[11px] text-zinc-500 font-medium">Mistral AI · Food Tracker</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-widest border-cyan-500/30 text-cyan-400 bg-cyan-500/5 px-2.5 py-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1.5 animate-blink inline-block" />
          Live
        </Badge>
      </div>
    </header>
  )
}
