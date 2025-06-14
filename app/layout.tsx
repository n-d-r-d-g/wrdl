import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider, ThemeScript } from './theme-provider'

export const metadata: Metadata = {
  title: 'wrdl - Wordle Clone',
  description: 'A Wordle clone built with React and TypeScript',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}