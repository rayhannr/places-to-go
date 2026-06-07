'use client'

import { useEffect, useRef, useState } from 'react'

export function useAppAuth() {
  const [passwordRequired, setPasswordRequired] = useState<boolean | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const passwordRef = useRef<string | null>(null)

  useEffect(() => { passwordRef.current = password }, [password])

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/auth/status')
        const { required } = await res.json()
        setPasswordRequired(required)
        if (required) {
          const stored = localStorage.getItem('app_password')
          if (stored) setPassword(stored)
        }
      } catch {
        setPasswordRequired(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    const handleAuthFailed = () => {
      localStorage.removeItem('app_password')
      setPassword(null)
    }
    window.addEventListener('auth-failed', handleAuthFailed)
    return () => window.removeEventListener('auth-failed', handleAuthFailed)
  }, [])

  const unlock = async (candidate: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: candidate })
      })
      const { success } = await res.json()
      if (success) {
        localStorage.setItem('app_password', candidate)
        setPassword(candidate)
      }
      return success
    } catch {
      return false
    }
  }

  return {
    isAuthLoading: passwordRequired === null,
    isLocked: passwordRequired === true && !password,
    passwordRef,
    unlock
  }
}
