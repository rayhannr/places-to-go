import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { cn } from '@/lib/utils'
import './globals.css'

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
    <html lang="en" className={cn(outfit.variable, 'h-full')} suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
