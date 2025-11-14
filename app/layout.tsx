import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import ThemeWrapper from './ThemeWrapper'
import ClientProviders from './client-providers'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Price Prediction Oracle',
  description: 'GenLayer Intelligent Contract Oracle for 24h market forecasts',
  icons: {
    icon: [{ url: '/favicon.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/favicon.png' }],
    shortcut: ['/favicon.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        <ThemeWrapper>
          <ClientProviders>{children}</ClientProviders>
        </ThemeWrapper>
      </body>
    </html>
  )
}

