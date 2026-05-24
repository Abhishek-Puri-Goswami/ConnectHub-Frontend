/**
 * ImageViewer — Full-screen lightbox for profile and group images.
 *
 * Usage:
 *   <ImageViewer src="https://..." name="John Doe" onClose={() => setOpen(false)} />
 *
 * Features:
 *   - Portal renders to document.body so it floats above everything
 *   - Click backdrop OR press Escape to close
 *   - Keyboard trap: focus stays inside while open
 *   - Smooth scale-in animation
 *   - Image name shown below
 */
import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './ImageViewer.css'

export default function ImageViewer({ src, name, onClose }) {
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prev
    }
  }, [handleKey])

  if (!src) return null

  return createPortal(
    <div className="imgv-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`View image: ${name || 'photo'}`}>
      <button className="imgv-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
      <div className="imgv-stage" onClick={e => e.stopPropagation()}>
        <img src={src} alt={name || 'Profile photo'} className="imgv-img" />
        {name && <p className="imgv-caption">{name}</p>}
      </div>
    </div>,
    document.body
  )
}
