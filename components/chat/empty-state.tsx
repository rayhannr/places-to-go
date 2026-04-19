'use client'

import { List, Plus, MapPin, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const QUICK_ACTIONS = [
  {
    id: 'recommend',
    label: 'Show me some recommendations',
    icon: List,
    color: 'text-blue-400'
  },
  {
    id: 'add',
    label: 'I want to add a new place',
    icon: Plus,
    color: 'text-violet-400'
  },
  {
    id: 'nearby',
    label: "What's nearby Sleman?",
    icon: MapPin,
    color: 'text-cyan-400'
  }
]

interface EmptyStateProps {
  onAction: (text: string) => void
  disabled?: boolean
}

export function EmptyState({ onAction, disabled }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6 animate-fade-up">
      <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mb-4 glow-primary">
        <Sparkles className="w-7 h-7 text-blue-400" />
      </div>
      <h2 className="text-lg font-semibold mb-1">How can I help?</h2>
      <p className="text-sm text-zinc-500 max-w-xs mb-8">Ask me for food recommendations or add a new place to your tracker.</p>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {QUICK_ACTIONS.map(({ id, label, icon: Icon, color }) => (
          <Button
            key={id}
            variant="outline"
            onClick={() => onAction(label)}
            disabled={disabled}
            className="justify-start gap-2.5 h-auto py-3 px-4 text-xs glass border-white/8 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all cursor-pointer"
          >
            <Icon className={cn('w-4 h-4 shrink-0', color)} />
            <span className="text-left text-zinc-300">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
