'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Volume2, VolumeX, RotateCcw, Sparkles, MapPin, Play, Award, Clock, Compass, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'


interface Place {
  name: string
  city: string
  link: string
  dist: string | number | null
  time: string | number | null
  visited: string | null
  index: number
}

const NEON_COLORS = [
  '#3b82f6', // Neon Blue
  '#8b5cf6', // Neon Violet
  '#ec4899', // Neon Pink
  '#10b981', // Neon Green
  '#f97316', // Neon Orange
  '#06b6d4', // Neon Cyan
  '#eab308' // Neon Yellow
]

export function WheelOfPlaces() {
  const { resolvedTheme } = useTheme()
  const [filter, setFilter] = useState<'unvisited' | 'visited' | 'all'>('unvisited')
  const [search, setSearch] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Selection / Wheel Pool
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [pickedIndices, setPickedIndices] = useState<Set<number>>(new Set())

  // Animation / Spin States
  const [isSpinning, setIsSpinning] = useState(false)
  const [winner, setWinner] = useState<Place | null>(null)
  const [showWinnerModal, setShowWinnerModal] = useState(false)

  // Canvas & Physics Refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const angleRef = useRef(0)
  const velocityRef = useRef(0)
  const lastIndexRef = useRef(-1)
  const pointerWiggleRef = useRef(0)
  const requestRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number>(0)

  // Friction per 60fps frame. Delta-time scaling keeps wall-clock duration fixed regardless of actual frame rate.
  const FRICTION = 0.985
  const STOP_THRESHOLD = 0.0008

  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ── React Query data fetching ──────────────────────────────────────────────
  const { data: places = [], isLoading, isError, error } = useQuery<Place[]>({
    queryKey: ['places'],
    queryFn: async () => {
      const password = typeof window !== 'undefined' ? localStorage.getItem('app_password') : null
      const res = await axios.get<Place[]>('/api/places', {
        headers: password ? { 'x-app-password': password } : {}
      })
      return res.data
    }
  })

  // Show error toast if the fetch fails
  useEffect(() => {
    if (isError) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        window.dispatchEvent(new Event('auth-failed'))
      } else {
        toast.error('Couldn\'t load your shit. Server ghosted us, bro.')
      }
    }
  }, [isError, error])

  // Sync selectedIndices with newly fetched data — non-destructively.
  // Only auto-select indices that are brand new (not seen before), keeping
  // any existing manual de-selections intact.
  const seenIndicesRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (places.length === 0) return
    const newlyAdded = places.filter(p => !seenIndicesRef.current.has(p.index))
    if (newlyAdded.length === 0) return

    setSelectedIndices(prev => {
      const next = new Set(prev)
      // Auto-select only unvisited new places
      newlyAdded.forEach(p => {
        if (!p.visited) next.add(p.index)
      })
      return next
    })
    newlyAdded.forEach(p => seenIndicesRef.current.add(p.index))
  }, [places])

  // Compute active pool based on selected and picked indices
  const activePool = useMemo(() => {
    return places.filter(p => selectedIndices.has(p.index) && !pickedIndices.has(p.index))
  }, [places, selectedIndices, pickedIndices])

  // Synthesis-based sound effect
  const playTickSound = () => {
    if (!soundEnabled || typeof window === 'undefined') return
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx()
        }
      }

      const ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'suspended') {
        ctx?.resume()
      }

      if (ctx) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(950, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04)

        gain.gain.setValueAtTime(0.09, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start()
        osc.stop(ctx.currentTime + 0.05)
      }
    } catch (e) {
      // Audio autoplay restrictions
    }
  }

  // Draw the Wheel Canvas
  const drawWheel = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isDark = resolvedTheme ? resolvedTheme === 'dark' : (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const cx = rect.width / 2
    const cy = rect.height / 2
    const radius = Math.min(rect.width, rect.height) / 2 - 15

    ctx.clearRect(0, 0, rect.width, rect.height)

    // Empty state
    if (activePool.length === 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'
      ctx.fill()

      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.4)'
      ctx.font = 'bold 13px var(--font-sans, Outfit, sans-serif)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Nothing to Spin, Bro!', cx, cy)
      ctx.restore()
      return
    }

    const sliceAngle = (2 * Math.PI) / activePool.length
    const currentAngle = angleRef.current

    // Outer Neon Ring Glow
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 5, 0, 2 * Math.PI)
    ctx.strokeStyle = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(79, 70, 229, 0.08)'
    ctx.lineWidth = 10
    ctx.stroke()
    ctx.restore()

    // Draw Slices
    activePool.forEach((place, i) => {
      const startAngle = currentAngle + i * sliceAngle
      const endAngle = startAngle + sliceAngle

      ctx.save()

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, startAngle, endAngle)
      ctx.closePath()

      ctx.fillStyle = NEON_COLORS[i % NEON_COLORS.length]
      ctx.fill()

      ctx.strokeStyle = isDark ? 'rgba(10, 10, 11, 0.6)' : 'rgba(255, 255, 255, 0.8)'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.beginPath()
      ctx.translate(cx, cy)
      const middleAngle = startAngle + sliceAngle / 2
      ctx.rotate(middleAngle)

      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'

      const fontSize = activePool.length > 15 ? 10 : activePool.length > 8 ? 12 : 13
      ctx.font = `bold ${fontSize}px var(--font-sans, Outfit, sans-serif)`

      let labelName = place.name
      const maxLabelLen = activePool.length > 15 ? 14 : 20
      if (labelName.length > maxLabelLen) {
        labelName = labelName.substring(0, maxLabelLen - 2) + '..'
      }

      ctx.fillText(labelName, radius - 15, 0)
      ctx.restore()
    })

    // Center Cap
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 25, 0, 2 * Math.PI)

    ctx.shadowColor = isDark ? 'rgba(59, 130, 246, 0.6)' : 'rgba(79, 70, 229, 0.15)'
    ctx.shadowBlur = 10
    ctx.fillStyle = isDark ? '#111113' : '#ffffff'
    ctx.fill()

    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'
    ctx.lineWidth = 2
    ctx.shadowBlur = 0
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, 2 * Math.PI)
    ctx.fillStyle = isDark ? '#3b82f6' : '#4f46e5'
    ctx.shadowColor = isDark ? '#3b82f6' : 'rgba(79, 70, 229, 0.4)'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.restore()

    // Physical Pointer
    ctx.save()
    ctx.translate(cx, cy - radius + 5)
    ctx.rotate(pointerWiggleRef.current)

    ctx.shadowColor = isDark ? '#f43f5e' : 'rgba(239, 68, 68, 0.3)'
    ctx.shadowBlur = 12
    ctx.fillStyle = isDark ? '#f43f5e' : '#ef4444'

    ctx.beginPath()
    ctx.moveTo(0, 16)
    ctx.lineTo(-11, -8)
    ctx.lineTo(11, -8)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(-6, -6)
    ctx.lineTo(6, -6)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // Update physics
  const updateWheelPhysics = (timestamp: number) => {
    if (activePool.length === 0) return

    // Delta-time: normalise to 60fps so slow render frames don't stretch the animation
    const delta = lastTimestampRef.current ? Math.min((timestamp - lastTimestampRef.current) / (1000 / 60), 10) : 1
    lastTimestampRef.current = timestamp

    velocityRef.current *= Math.pow(FRICTION, delta)
    angleRef.current += velocityRef.current * delta

    pointerWiggleRef.current *= Math.pow(0.85, delta)

    const sliceAngle = (2 * Math.PI) / activePool.length
    const normalizedAngle = (-Math.PI / 2 - angleRef.current) % (2 * Math.PI)
    const positiveAngle = normalizedAngle < 0 ? normalizedAngle + 2 * Math.PI : normalizedAngle
    const currentIndex = Math.floor(positiveAngle / sliceAngle) % activePool.length

    if (currentIndex !== lastIndexRef.current) {
      lastIndexRef.current = currentIndex
      pointerWiggleRef.current = 0.28
      playTickSound()
    }

    drawWheel()

    if (velocityRef.current > STOP_THRESHOLD) {
      requestRef.current = requestAnimationFrame(updateWheelPhysics)
    } else {
      setIsSpinning(false)
      velocityRef.current = 0

      const winnerPlace = activePool[currentIndex]
      setWinner(winnerPlace)
      setShowWinnerModal(true)

      setPickedIndices(prev => {
        const next = new Set(prev)
        next.add(winnerPlace.index)
        return next
      })

      toast.success(`There you go: ${winnerPlace.name}. Stop overthinking and just go.`, {
        icon: '🎉',
        duration: 4000
      })
    }
  }

  // Spin
  const startSpin = () => {
    if (isSpinning || activePool.length === 0) return

    setIsSpinning(true)
    setWinner(null)

    // Fixed fast launch — friction does all the work from here
    velocityRef.current = 0.55 + Math.random() * 0.08
    lastTimestampRef.current = 0

    lastIndexRef.current = -1

    if (requestRef.current) cancelAnimationFrame(requestRef.current)
    requestRef.current = requestAnimationFrame(updateWheelPhysics)
  }

  useEffect(() => {
    drawWheel()
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [activePool, resolvedTheme])

  useEffect(() => {
    const handleResize = () => drawWheel()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activePool])

  // Filter & Search
  const filteredPlaces = places.filter(p => {
    const matchesFilter = filter === 'all' || (filter === 'visited' && !!p.visited) || (filter === 'unvisited' && !p.visited)

    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.city.toLowerCase().includes(search.toLowerCase())

    return matchesFilter && matchesSearch
  })

  // Group helpers
  const handleToggleSelectAll = (checked: boolean) => {
    const currentFilteredIndices = filteredPlaces.map(p => p.index)
    const newSelected = new Set(selectedIndices)

    currentFilteredIndices.forEach(idx => {
      if (checked) {
        newSelected.add(idx)
      } else {
        newSelected.delete(idx)
      }
    })

    setSelectedIndices(newSelected)
  }

  const handleTogglePlace = (index: number) => {
    const newSelected = new Set(selectedIndices)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedIndices(newSelected)
  }

  const handleResetPicked = () => {
    setPickedIndices(new Set())
    toast.success('All cleared. Back in the game, bro.')
  }

  const allFilteredSelected = filteredPlaces.length > 0 && filteredPlaces.every(p => selectedIndices.has(p.index))

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[460px] rounded-2xl glass relative overflow-hidden select-none animate-fade-in">
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-blue-500/10 blur-[60px]" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/10 blur-[60px]" />

        <div className="relative flex flex-col items-center gap-6 z-10">
          {/* Animated Spinner with Neon Glow */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            {/* outer glowing pulse ring */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-violet-500/20 animate-spin [animation-duration:12s]" />
            {/* inner spinning loader */}
            <div className="absolute w-14 h-14 rounded-full border-2 border-transparent border-t-blue-500 border-r-blue-500/40 animate-spin [animation-duration:1.2s]" />
            {/* center glowing core */}
            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-500 to-violet-500 animate-pulse-glow shadow-[0_0_15px_rgba(139,92,246,0.6)]" />
          </div>

          <div className="flex flex-col gap-1.5 text-center">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
              Hang Tight
            </h3>
            <p className="text-xs text-zinc-400 max-w-[240px] leading-relaxed">
              Pulling up your list, don't rush me.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      {/* 🎡 WHEEL SECTION ─── */}
      <div className="flex flex-col items-center gap-5 p-5 rounded-2xl glass relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-blue-500/10 blur-[60px]" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/10 blur-[60px]" />

        <div className="w-full flex items-center justify-between z-10">
          <Badge variant="outline" className="border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/5 text-[11px] text-blue-600 dark:text-blue-400">
            <Sparkles className="w-3 h-3 mr-1" />
            {activePool.length} Places Ready to Spin
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-8 h-8 text-zinc-400 hover:text-zinc-200"
            title={soundEnabled ? 'Kill the sound' : 'Bring the noise'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
          </Button>
        </div>

        {/* Dynamic Interactive Wheel Canvas */}
        <div className="relative w-[290px] h-[290px] md:w-[310px] md:h-[310px] flex items-center justify-center select-none z-10">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-pointer touch-none"
            style={{ width: '100%', height: '100%' }}
            onClick={startSpin}
          />
          <div className="absolute inset-0 rounded-full border border-black/[0.06] dark:border-zinc-800/40 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]" />
        </div>

        <Button
          onClick={startSpin}
          disabled={isSpinning || activePool.length === 0}
          className="w-full max-w-[200px] bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold py-5 rounded-xl glow-primary transition-all duration-300 z-10 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4 fill-white" />
          {isSpinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
        </Button>
      </div>

      {/* 🎛️ CONTROL & POOL LIST SECTION ─── */}
      <div className="p-5 rounded-2xl glass flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-foreground">PICK YOUR SPOTS</h2>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Check off what goes on the wheel. Already picked a spot? It gets struck through so you can't cheat and land on it twice.
          </p>
        </div>

        {/* Quick Filters */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter('unvisited')}
            className={cn(
              'flex-1 text-[11px] h-8 rounded-lg transition-all',
              filter === 'unvisited'
                ? 'bg-zinc-900 dark:bg-zinc-800 text-zinc-100 border-zinc-800 dark:border-zinc-700'
                : 'text-muted-foreground hover:text-foreground border-border'
            )}
          >
            Not Visited
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter('visited')}
            className={cn(
              'flex-1 text-[11px] h-8 rounded-lg transition-all',
              filter === 'visited'
                ? 'bg-zinc-900 dark:bg-zinc-800 text-zinc-100 border-zinc-800 dark:border-zinc-700'
                : 'text-muted-foreground hover:text-foreground border-border'
            )}
          >
            Visited
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter('all')}
            className={cn(
              'flex-1 text-[11px] h-8 rounded-lg transition-all',
              filter === 'all'
                ? 'bg-zinc-900 dark:bg-zinc-800 text-zinc-100 border-zinc-800 dark:border-zinc-700'
                : 'text-muted-foreground hover:text-foreground border-border'
            )}
          >
            All Places
          </Button>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Find a spot or city..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/80 rounded-xl px-3 py-2 text-foreground dark:text-zinc-200 placeholder-muted-foreground dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-muted-foreground dark:text-zinc-500 hover:text-foreground dark:hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {pickedIndices.size > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleResetPicked}
              className="w-8 h-8 rounded-xl border border-border dark:border-zinc-800/80 text-muted-foreground hover:text-foreground dark:text-zinc-400 dark:hover:text-zinc-200 shrink-0"
              title="Bring 'em back"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <Separator className="bg-border" />

        {/* Batch Selection Action using Shadcn Checkbox */}
        <div className="flex items-center justify-between text-xs px-1 select-none">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all-places"
              checked={allFilteredSelected}
              disabled={isSpinning}
              onCheckedChange={checked => handleToggleSelectAll(!!checked)}
              className="border-zinc-300 dark:border-zinc-700"
            />
            <label htmlFor="select-all-places" className="text-muted-foreground hover:text-foreground font-medium cursor-pointer transition-colors">
              Select All ({filteredPlaces.length})
            </label>
          </div>

          {pickedIndices.size > 0 && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{pickedIndices.size} Struck</span>
          )}
        </div>

        {/* Scrollable list of places */}
        <ScrollArea className="h-[210px] pr-1">
          {!filteredPlaces.length ? (
            <div className="flex items-center justify-center h-[180px] text-zinc-600 text-xs font-medium">
              Nothing found. Try typing better.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 pb-2">
              {filteredPlaces.map(place => {
                const isSelected = selectedIndices.has(place.index)
                const isPicked = pickedIndices.has(place.index)

                return (
                  <div
                    key={place.index}
                    onClick={() => !isSpinning && !isPicked && handleTogglePlace(place.index)}
                    className={cn(
                      'flex items-center justify-between p-2.5 rounded-xl border transition-all select-none',
                      isPicked
                        ? 'bg-black/[0.02] dark:bg-zinc-950/20 border-dashed border-black/[0.08] dark:border-zinc-900 text-zinc-400 dark:text-zinc-600'
                        : isSelected
                          ? 'bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/80 text-foreground dark:text-zinc-200 cursor-pointer'
                          : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground cursor-pointer'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="shrink-0" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected && !isPicked}
                          disabled={isPicked || isSpinning}
                          onCheckedChange={() => handleTogglePlace(place.index)}
                          className="border-zinc-300 dark:border-zinc-700"
                        />
                      </div>
                      <div className={cn('min-w-0', isPicked && 'line-through')}>
                        <p className="text-xs font-semibold truncate leading-none mb-1">{place.name}</p>
                        <p className="text-[10px] text-muted-foreground font-medium">{place.city}</p>
                      </div>
                    </div>

                    {place.visited && (
                      <Badge
                        variant="outline"
                        className="border-green-500/20 text-green-500/70 text-[9px] bg-green-500/5 py-0 px-1.5 shrink-0 ml-2"
                      >
                        Visited
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 🏆 SHADCN WINNER CELEBRATION DIALOG MODAL ─── */}
      <Dialog open={showWinnerModal} onOpenChange={setShowWinnerModal}>
        <DialogContent className="glass border-border text-foreground p-6 flex flex-col items-center gap-5 text-center max-w-sm rounded-2xl shadow-2xl select-none z-50">
          <DialogHeader className="flex flex-col items-center gap-1.5 w-full">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-600/10 flex items-center justify-center border border-violet-200 dark:border-violet-500/35 glow-primary shadow-[0_4px_16px_rgba(139,92,246,0.08)] dark:shadow-[0_0_24px_rgba(139,92,246,0.3)] mb-2">
              <Award className="w-8 h-8 text-violet-600 dark:text-violet-400 animate-bounce" />
            </div>
            <DialogTitle className="text-[10px] uppercase tracking-[0.25em] text-violet-600 dark:text-violet-400 font-bold leading-none">
              WHEEL PICK
            </DialogTitle>
            <DialogDescription className="text-xl font-bold tracking-tight text-foreground px-2 mt-1 leading-snug">
              {winner?.name}
            </DialogDescription>
          </DialogHeader>

          {winner && (
            <>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 -mt-3">
                <MapPin className="w-3 h-3 text-muted-foreground/60" />
                {winner.city}
              </p>

              {/* Travel metrics in winner popup */}
              {(winner.dist || winner.time) && (
                <div className="grid grid-cols-2 gap-2 w-full p-3 bg-white/70 dark:bg-zinc-900/60 rounded-xl border border-black/[0.04] dark:border-zinc-800/40 text-left">
                  {winner.dist && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Distance</span>
                      <span className="text-xs font-bold text-foreground flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        {winner.dist} km
                      </span>
                    </div>
                  )}
                  {winner.time && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Time</span>
                      <span className="text-xs font-bold text-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                        {winner.time} min
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2.5 w-full mt-2">
                <a
                  href={winner.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.25)] flex items-center justify-center gap-2 text-xs"
                >
                  <MapPin className="w-4 h-4 fill-white text-blue-600" />
                  OPEN IN GOOGLE MAPS
                </a>

                <Button
                  onClick={() => setShowWinnerModal(false)}
                  className="w-full bg-transparent dark:bg-zinc-900 border border-black/[0.08] dark:border-zinc-800 hover:bg-black/[0.02] dark:hover:bg-zinc-800/80 text-foreground dark:text-zinc-200 font-semibold py-3 rounded-xl transition-all text-xs cursor-pointer"
                >
                  GOT IT, LET'S EAT!
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
