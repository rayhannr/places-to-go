'use client'

import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface LockScreenProps {
  onUnlock: (password: string) => Promise<boolean>
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [input, setInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setIsVerifying(true)
    try {
      const success = await onUnlock(input)
      if (success) {
        setInput('')
      } else {
        toast.error('Wrong password. Try again.')
        setInput('')
      }
    } catch {
      toast.error('Could not verify password. Try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-4">
      <div className="glass p-8 rounded-2xl w-full max-w-sm flex flex-col items-center gap-6 relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-40 h-40 rounded-full bg-blue-500/10 blur-[50px]" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 rounded-full bg-violet-500/10 blur-[50px]" />

        <div className="relative z-10 flex flex-col items-center gap-6 w-full">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center border border-blue-200 dark:border-blue-500/30 shadow-[0_4px_16px_rgba(59,130,246,0.08)] dark:shadow-[0_0_20px_rgba(59,130,246,0.2)]">
            <Lock className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex flex-col items-center gap-1.5 text-center">
            <h1 className="text-lg font-black tracking-tight">Places to Go</h1>
            <p className="text-xs text-muted-foreground">Enter the password to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Password"
                className="w-full text-sm bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/80 rounded-xl px-4 py-3 pr-10 text-foreground placeholder-muted-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-700 transition-colors"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isVerifying || !input.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {isVerifying ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
