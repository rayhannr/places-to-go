'use client'

import { Bot, User, Loader2, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message, ToolPart } from '@/lib/types'
import { cn } from '@/lib/utils'

function ToolPartView({ part }: { part: ToolPart }) {
  const toolName = part.type.replace('tool-', '')

  const statusTextMap: Record<string, string> = {
    add_place: 'Adding place to tracker…',
    get_current_location: 'Locating you…',
    sync_all_distances: 'Syncing distances from your location…',
    visit_place: 'Updating visit date…',
    delete_place: 'Deleting place from tracker…',
    parse_place_link: 'Parsing place link…',
    get_nearby_places: 'Finding nearby places…',
    get_quickest_places: 'Finding quickest places…',
    get_random_places: 'Picking a random place…',
    get_places_by_city: 'Fetching places by city…',
    search_places_by_name: 'Searching your places…',
    search_google_maps: 'Searching Google Maps…',
    get_priority_places: 'Fetching your priority list…',
    prioritize_place: 'Updating priority…'
  }

  const getStatusText = () => statusTextMap[toolName] ?? 'Fetching your places…'

  const defaultSuccessIcon = (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
  )
  const defaultErrorIcon = (
    <CheckCircle2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
  )
  const defaultWarningIcon = (
    <CheckCircle2 className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
  )

  const renderResult = (icon: React.ReactNode, children: React.ReactNode) => (
    <ToolResult icon={icon}>{children}</ToolResult>
  )

  const renderSuccess = (children: React.ReactNode) => renderResult(defaultSuccessIcon, children)
  const renderError = (message: string, icon = defaultErrorIcon) => renderResult(icon, message)

  const renderPlaceListResult = (output: any, verb: string) => {
    const count = output?.length ?? 0
    return renderSuccess(
      <>{verb} {count} place{count !== 1 ? 's' : ''}</>
    )
  }

  const renderToolOutput = (output: any) => {
    switch (toolName) {
      case 'add_place': {
        if (output?.isDuplicate) {
          return renderError('Place already in your list')
        }
        const name = output?.entry?.name ?? 'place'
        return renderSuccess(<>Added "{name}" successfully</>)
      }
      case 'get_current_location': {
        if (!output?.success) {
          return renderError('GPS unavailable — share your location first', defaultWarningIcon)
        }
        const address = output?.address || 'Unknown address'
        return renderSuccess(<>Located: {address}</>)
      }
      case 'sync_all_distances': {
        if (!output?.success) {
          return renderError('No location available — share your GPS or a Maps link', defaultWarningIcon)
        }
        const label = output?.updated
          ? `Updated distances for ${output.count} place${output.count !== 1 ? 's' : ''}`
          : 'Already up to date — you haven\'t moved more than 2km'
        return renderSuccess(<>{label}</>)
      }
      case 'visit_place': {
        const name = output?.placeName ?? 'place'
        const date = output?.visitDate ?? 'today'
        if (!output?.success) {
          return renderError(output?.message || `Failed to mark "${name}" as visited`)
        }
        if (!output?.visitDate) {
          return renderSuccess(<>Cleared visit date for "{name}"</>)
        }
        return renderSuccess(<>Marked "{name}" visited on {date}</>)
      }
      case 'delete_place': {
        const name = output?.placeName ?? 'place'
        if (!output?.success) {
          return renderError(output?.message || `Failed to delete "${name}"`)
        }
        return renderSuccess(<>Deleted "{name}" from tracker</>)
      }
      case 'prioritize_place': {
        const name = output?.placeName ?? 'place'
        if (!output?.success) {
          return renderError(output?.message || `Failed to prioritize "${name}"`)
        }
        return renderSuccess(`Set "${name}" to priority ${output?.priority}`)
      }
      case 'parse_place_link': {
        if (!output?.success) {
          return renderError(output?.message || 'Failed to parse the place link.')
        }
        const name = output?.placeName
        const coords = output?.coords as { lat: number; lng: number } | undefined
        const coordLabel = coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : 'coordinates not found'
        return renderSuccess(
          <>Parsed {name ? `"${name}"` : 'place'} — {coordLabel}</>
        )
      }
      case 'get_nearby_places':
        return renderPlaceListResult(output, 'Found')
      case 'get_quickest_places':
        return renderPlaceListResult(output, 'Found')
      case 'get_random_places':
        return renderPlaceListResult(output, 'Picked')
      case 'get_places_by_city':
        return renderPlaceListResult(output, 'Found')
      case 'search_places_by_name':
        return renderPlaceListResult(output, 'Found')
      case 'get_priority_places':
        return renderPlaceListResult(output, 'Found')
      case 'search_google_maps': {
        const count = output?.length ?? 0
        return renderSuccess(<>Found {count} result{count !== 1 ? 's' : ''} on Google Maps</>)
      }
      default:
        return renderPlaceListResult(output, 'Found')
    }
  }

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted border border-border animate-fade-up">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
        <span className="text-xs text-muted-foreground">{getStatusText()}</span>
      </div>
    )
  }

  if (part.state === 'output-available') {
    return renderToolOutput(part.output)
  }

  return null
}

function ToolResult({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40 dark:border-emerald-500/20 animate-fade-up">
      {icon}
      <span className="text-xs text-emerald-700 dark:text-emerald-300">{children}</span>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-1.5 animate-fade-up', isUser ? 'items-end' : 'items-start')}>
      {/* Role label */}
      <div className={cn('flex items-center gap-1.5 opacity-50', isUser && 'flex-row-reverse')}>
        {isUser ? <User size={11} className="text-primary" /> : <Bot size={11} className="text-secondary" />}
        <span className="text-[10px] uppercase font-bold tracking-widest text-foreground">{isUser ? 'You' : 'Assistant'}</span>
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-relaxed transition-colors duration-300',
          isUser 
            ? 'bg-primary text-primary-foreground shadow-sm rounded-tr-none' 
            : 'glass text-foreground rounded-tl-none border-border'
        )}
      >
        <div className="flex flex-col gap-2">
          {message.parts ? (
            message.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <div key={i} className="markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm as any]}
                      components={{
                        a: ({ node, ...props }) => (
                          <a target="_blank" rel="noopener noreferrer" {...props} />
                        )
                      }}
                    >
                      {(part as { type: 'text'; text: string }).text}
                    </ReactMarkdown>
                  </div>
                )
              }
              if (part.type.startsWith('tool-')) {
                return <ToolPartView key={i} part={part as ToolPart} />
              }
              return null
            })
          ) : (
            <div className="markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm as any]}
                components={{
                  a: ({ node, ...props }) => (
                    <a target="_blank" rel="noopener noreferrer" {...props} />
                  )
                }}
              >
                {message.content ?? ''}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
