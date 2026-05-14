/*
 * ThemeToggle.jsx — Multi-Theme Palette Picker
 *
 * Purpose:
 *   Opens a small popover that lets the user choose from six themes:
 *   Light, Ocean, Forest, Rose, Dark, Midnight.
 *
 * Props:
 *   compact (boolean, default false) — when true, renders an icon-only button
 *   without the "Theme" label. Used in tight spaces like the Sidebar header.
 *
 * How it works:
 *   - A Palette icon button triggers a popover with six color swatches.
 *   - Each swatch shows a diagonal split: primary color on top-left, bg color on
 *     bottom-right. The active theme gets a checkmark overlay and a highlighted border.
 *   - Clicking a swatch calls setTheme(id) and closes the popover.
 *   - A mousedown listener on document closes the popover when clicking outside.
 */
import { useState, useRef, useEffect } from 'react'
import { Palette, Check } from 'lucide-react'
import { useTheme, THEMES } from './ThemeContext'
import './ThemeToggle.css'

export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  /* Close popover when clicking outside */
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const activeTheme = THEMES.find(t => t.id === theme) || THEMES[0]

  return (
    <div className="tp-wrap" ref={wrapRef}>
      <button
        className={`tp-btn ${compact ? 'compact' : ''} ${open ? 'active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Choose theme"
        aria-label="Choose theme"
        aria-expanded={open}
      >
        {/* Compact: palette icon only. Full: mini swatch + "Theme" label. */}
        {compact
          ? <Palette size={16} />
          : (
            <>
              <span
                className="tp-preview"
                style={{
                  background: `linear-gradient(135deg, ${activeTheme.primary} 55%, ${activeTheme.bg} 55%)`
                }}
              />
              <span className="tp-label">Theme</span>
            </>
          )
        }
      </button>

      {open && (
        <div className="tp-pop scale-in" role="dialog" aria-label="Theme picker">
          <div className="tp-pop-title">Choose theme</div>
          <div className="tp-grid">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`tp-swatch ${theme === t.id ? 'active' : ''}`}
                onClick={() => { setTheme(t.id); setOpen(false) }}
                title={t.name}
              >
                <span
                  className="tp-swatch-circle"
                  style={{
                    background: `linear-gradient(135deg, ${t.primary} 50%, ${t.bg} 50%)`
                  }}
                >
                  {theme === t.id && (
                    <span className="tp-swatch-check">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="tp-swatch-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
