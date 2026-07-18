'use client'

import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { CATEGORY_LABELS, CATEGORY_ORDER, TOOL_METADATA } from '@/lib/ai/tools/metadata'

const groupedTools = CATEGORY_ORDER.map(category => ({
  category,
  tools: Object.values(TOOL_METADATA).filter(meta => meta.category === category)
}))

export function ToolsInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 border-border hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 group transition-all duration-300"
            title="What am I packing?"
          />
        }
      >
        <Info className="w-4 h-4 group-hover:scale-110 transition-transform" />
      </DialogTrigger>
      <DialogContent className="glass border-border text-foreground p-6 max-w-md max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">What I Got</DialogTitle>
          <DialogDescription>Here&apos;s the whole toolkit. Don&apos;t say I didn&apos;t warn you.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 mt-1">
          {groupedTools.map(({ category, tools }) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </h3>
              <ul className="flex flex-col gap-2">
                {tools.map(tool => (
                  <li key={tool.label} className="text-xs leading-relaxed">
                    <span className="font-semibold text-foreground">{tool.label}</span>
                    <span className="text-muted-foreground"> — {tool.blurb}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
