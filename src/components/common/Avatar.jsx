import React, { memo, useState } from 'react'

const PALETTE = ['#FF8E72','#7AC9A7','#B8A4F4','#FFB547','#F47174','#6BCEEA','#FF9F87','#9D8FF5']

const Avatar = memo(function Avatar({ src, name, className = '', style = {}, isOwn = false }) {
  const [imgError, setImgError] = useState(false)

  // Show image only if src is a non-empty string AND hasn't errored
  if (src && typeof src === 'string' && src.trim() !== '' && !imgError) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={className}
        loading="lazy"
        decoding="async"
        style={{ objectFit: 'cover', ...style }}
        onError={() => setImgError(true)}
      />
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
