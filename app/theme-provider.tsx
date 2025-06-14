'use client'

import { useEffect, useState } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent flash of wrong theme
  if (!mounted) {
    return <>{children}</>
  }

  return <>{children}</>
}

// Blocking script to set theme immediately
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var theme = localStorage.getItem('wrdl-theme') || 'system';
              document.documentElement.setAttribute('data-theme', theme);
              document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'light dark';
            } catch (e) {
              document.documentElement.setAttribute('data-theme', 'system');
              document.documentElement.style.colorScheme = 'light dark';
            }
          })();
        `,
      }}
    />
  )
}