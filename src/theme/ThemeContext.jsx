/*
 * ThemeContext.jsx — Global Theme Management (Light / Dark / Ocean / Forest / Rose / Midnight)
 *
 * Purpose:
 *   Provides theme state to every component in the app without prop drilling.
 *   Supports six themes: light, dark, ocean, forest, rose, midnight.
 *
 * How it works:
 *   1. ThemeProvider reads the user's previously saved preference from localStorage
 *      on startup. Falls back to OS preference (prefers-color-scheme) → 'light'.
 *
 *   2. Whenever the theme changes, a useEffect writes the new value to:
 *      - <html data-theme="..."> → CSS variables switch automatically.
 *      - localStorage → preference survives page refreshes.
 *      - document.documentElement.style.colorScheme → native controls update.
 *
 *   3. useTheme() returns { theme, setTheme, toggle, isDark }.
 *
 * THEMES — exported array used by ThemeToggle to render the palette picker.
 *   Each entry: { id, name, primary, bg, text, dark }
 */
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'connecthub-theme'

/* Themes that should use colorScheme: 'dark' for browser native controls */
const DARK_THEMES = new Set(['dark', 'midnight'])

/* Ordered list of all available themes */
export const THEMES = [
  { id: 'light',    name: 'Light',    primary: '#FF8E72', bg: '#FDF6EC', text: '#2D2438', dark: false },
  { id: 'ocean',    name: 'Ocean',    primary: '#0EA5E9', bg: '#F0F9FF', text: '#0F172A', dark: false },
  { id: 'forest',   name: 'Forest',   primary: '#16A34A', bg: '#F0FDF4', text: '#052E16', dark: false },
  { id: 'rose',     name: 'Rose',     primary: '#EC4899', bg: '#FFF1F5', text: '#1F0214', dark: false },
  { id: 'dark',     name: 'Dark',     primary: '#FF9F87', bg: '#252136', text: '#F5EDE0', dark: true  },
  { id: 'midnight', name: 'Midnight', primary: '#6366F1', bg: '#111827', text: '#F1F5F9', dark: true  },
]

const VALID_IDS = new Set(THEMES.map(t => t.id))

export function ThemeProvider({ children }) {
  /*
   * Lazy initial state: reads from localStorage first, falls back to OS pref.
   */
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && VALID_IDS.has(saved)) return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const isDark = DARK_THEMES.has(theme)

  /*
   * Sync the DOM and localStorage whenever theme changes.
   * CSS variables react to [data-theme="..."] selectors in index.css.
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [theme, isDark])

  /*
   * toggle() cycles: light → dark → light (or any dark ↔ light flip).
   * Kept for backwards compat with any component that still calls it.
   */
  const toggle = () => setTheme(t => (DARK_THEMES.has(t) ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

/*
 * useTheme — custom hook for consuming the theme context.
 * Returns { theme, setTheme, toggle, isDark }.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
