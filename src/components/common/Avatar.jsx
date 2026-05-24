import React, { memo, useState } from 'react'
import ImageViewer from './ImageViewer'

const PALETTE = ['#FF8E72','#7AC9A7','#B8A4F4','#FFB547','#F47174','#6BCEEA','#FF9F87','#9D8FF5']

/**
 * Avatar — renders a profile image or a colored initial-fallback circle.
 *
 * Props:
 *   src       — image URL; falls back to initial if missing or broken
 *   name      — display name used for the initial and alt text
 *   className — class forwarded to the root element
 *   style     — style forwarded to the root element
 *   isOwn     — if true, uses the primary-color gradient for the fallback
 *   viewable  — if true AND src is present, clicking opens a full-screen lightbox
 *   viewName  — override the caption shown in the lightbox (defaults to name)
 */
const Avatar = memo(function Avatar({
  src, name, className = '', style = {}, isOwn = false,
  viewable = false, viewName,
}) {
  const [imgError, setImgError] = useState(false)
  const [viewing,  setViewing]  = useState(false)

  const hasImage = src && typeof src === 'string' && src.trim() !== '' && !imgError
  const canView  = viewable && hasImage

  const handleClick = canView
    ? (e) => { e.stopPropagation(); setViewing(true) }
    : undefined

  const cursorStyle = canView ? { cursor: 'pointer' } : {}

  if (hasImage) {
    return (
      <>
        <img
          src={src}
          alt={name || 'Avatar'}
          className={className}
          loading="lazy"
          decoding="async"
          style={{ objectFit: 'cover', ...cursorStyle, ...style }}
          onClick={handleClick}
          onError={() => setImgError(true)}
          title={canView ? `View ${viewName || name || 'photo'}` : undefined}
        />
        {viewing && (
          <ImageViewer
            src={src}
            name={viewName || name}
            onClose={() => setViewing(false)}
          />
        )}
      </>
    )
  }

  // Fallback: colored circle with initial
  const bg = isOwn
    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)'
    : PALETTE[(String(name || '').charCodeAt(0) || 0) % PALETTE.length]

  const initial = typeof name === 'string' && name ? name.charAt(0).toUpperCase() : '?'

  return (
    <div
      className={className}
      style={{
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 600,
        userSelect: 'none',
        ...style
      }}
    >
      {initial}
    </div>
  )
})

export default Avatar
