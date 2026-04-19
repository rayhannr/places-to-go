import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Places To Go — AI Food Tracker',
  description: 'Your personal AI-powered food destination tracker. Ask for recommendations or add new places using natural language.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={cn(outfit.variable, 'h-full')}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  )
}
