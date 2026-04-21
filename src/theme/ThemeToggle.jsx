/*
 * ThemeToggle.jsx — Light/Dark Mode Toggle Button
 *
 * Purpose:
 *   A reusable button that lets the user switch between light and dark themes.
 *   It reads the current theme from ThemeContext and calls toggle() on click.
 *
 * Props:
 *   compact (boolean, default false) — when true, renders a smaller icon-only
 *   version of the button. Used in the Sidebar header where space is tight.
 *   When false (default), shows both the icon and "Light" / "Dark" text labels.
 *
 * How it works:
 *   - Reads `theme` from useTheme() to know which icon and label to show.
 *   - Calls `toggle()` on click, which flips the theme in ThemeContext.
 *   - ThemeContext then updates the <html data-theme> attribute, which causes
 *     all CSS variables to switch instantly across the entire app.
 */
import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeContext'
import './ThemeToggle.css'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      className={`theme-toggle ${compact ? 'compact' : ''}`}
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {/* The thumb shows the icon for the current mode (Moon = dark, Sun = light) */}
      <span className={`theme-thumb ${isDark ? 'dark' : 'light'}`}>
        {isDark ? <Moon size={compact ? 14 : 16} /> : <Sun size={compact ? 14 : 16} />}
      </span>
      {/* Full-size version shows text labels; compact version hides them */}
      {!compact && (
        <span className="theme-track-labels">
          <span className={!isDark ? 'active' : ''}>Light</span>
          <span className={isDark ? 'active' : ''}>Dark</span>
        </span>
      )}
    </button>
  )
}
