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
 *
 * Portal rendering:
 *   The popover is rendered via ReactDOM.createPortal directly into document.body.
 *   This ensures it is never clipped by overflow:hidden/auto ancestors (e.g. on
 *   iOS Safari where position:fixed descendants of overflow containers get clipped).
 *   The popover position is calculated from the button's getBoundingClientRect()
 *   and applied as fixed-position inline styles.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Palette, Check } from 'lucide-react'
import { useTheme, THEMES } from './ThemeContext'
import './ThemeToggle.css'

export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [popPos, setPopPos] = useState({ top: 0, right: 0 })
  const wrapRef = useRef(null)
  const popRef = useRef(null)

  /* Compute portal position from button rect whenever the popover opens */
  const openPopover = useCallback(() => {
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      setPopPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(true)
  }, [])

  /* Close popover when clicking outside both button and portal */
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        !wrapRef.current?.contains(e.target) &&
        !popRef.current?.contains(e.target)
      ) {
        setOpen(false)
      }
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

  const popover = open && createPortal(
    <div
      ref={popRef}
      className="tp-pop scale-in"
      role="dialog"
      aria-label="Theme picker"
      style={{
        position: 'fixed',
        top: popPos.top,
        right: popPos.right,
        zIndex: 99999,
      }}
    >
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
    </div>,
    document.body
  )

  return (
    <>
      <div className="tp-wrap" ref={wrapRef}>
        <button
          className={`tp-btn ${compact ? 'compact' : ''} ${open ? 'active' : ''}`}
          onClick={() => open ? setOpen(false) : openPopover()}
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
      </div>
      {popover}
    </>
  )
}
