/*
 * ThemeContext.jsx — Global Light/Dark Theme Management
 *
 * Purpose:
 *   Provides light/dark theme state to every component in the app without
 *   needing to pass props manually down through every level of the component tree.
 *
 * How it works:
 *   1. ThemeProvider reads the user's previously saved preference from localStorage
 *      on startup. If no preference was saved, it falls back to the OS/browser
 *      setting (window.matchMedia prefers-color-scheme).
 *
 *   2. Whenever the theme changes, a useEffect writes the new value to:
 *      - The <html data-theme="..."> attribute → so CSS variables like
 *        --background, --text, etc. switch automatically via CSS selectors.
 *      - localStorage → so the preference survives page refreshes.
 *      - document.documentElement.style.colorScheme → so browser native
 *        controls (scrollbars, inputs) also switch to the correct OS mode.
 *
 *   3. Any component that needs to read or toggle the theme calls useTheme(),
 *      which returns { theme, setTheme, toggle }. useTheme() throws if called
 *      outside a ThemeProvider to catch accidental misuse early.
 */
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'connecthub-theme'

export function ThemeProvider({ children }) {
  /*
   * Lazy initial state: the function runs only once on mount.
   * Priority order: localStorage saved value → OS preference → 'light' fallback.
   */
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  /*
   * Sync the DOM and localStorage every time theme changes.
   * CSS variables react to [data-theme="dark"] selector in index.css.
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  /* toggle() flips between 'light' and 'dark'. Used by ThemeToggle button. */
  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

/*
 * useTheme — custom hook for consuming the theme context.
 * Returns { theme, setTheme, toggle }.
 * Throws a clear error if called outside <ThemeProvider>.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
