'use client'

import { ChefHat, MapPin } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { ToolsInfoDialog } from '@/components/chat/tools-info-dialog'
import { Button } from '@/components/ui/button'

export function ChatHeader({ onLocationClick }: { onLocationClick: () => void }) {
  return (
    <header className="flex items-center justify-between mb-6 animate-fade-up shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl glass flex items-center justify-center glow-primary">
          <ChefHat className="text-blue-500 dark:text-blue-400 w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Places To Go</h1>
          <p className="text-[11px] text-muted-foreground font-medium">Mistral AI · Food Tracker</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onLocationClick}
          className="w-9 h-9 border-border hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 group transition-all duration-300"
          title="Where you at?"
        >
          <MapPin className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </Button>

        <ThemeToggle />
        <ToolsInfoDialog />
      </div>
    </header>
  )
}
