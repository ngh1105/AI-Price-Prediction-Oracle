'use client'

import { useEffect, useState } from 'react'

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
    const stored = window.localStorage?.getItem('theme') as 'light' | 'dark' | null
    return stored ?? (prefersDark ? 'dark' : 'light')
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage?.setItem('theme', theme)
    } catch {}
  }, [theme])

  return <>{children}</>
}

