/*
 * BroadcastBanner — Platform-wide admin message banner.
 *
 * Listens for the custom "platformBroadcast" DOM event dispatched by websocket.js
 * whenever the backend publishes to /topic/broadcast. Renders a dismissible banner
 * fixed at the top of the viewport so it is visible regardless of the current route.
 *
 * The event detail shape: { type, title, message, actorId, sentAt }
 */
import { useState, useEffect } from 'react'
import { X, Megaphone } from 'lucide-react'
import './BroadcastBanner.css'

export default function BroadcastBanner() {
  const [broadcast, setBroadcast] = useState(null)

  useEffect(() => {
    const handler = (e) => setBroadcast(e.detail)
    window.addEventListener('platformBroadcast', handler)
    return () => window.removeEventListener('platformBroadcast', handler)
  }, [])

  if (!broadcast) return null

  return (
    <div className="broadcast-banner" role="alert" aria-live="polite">
      <div className="broadcast-banner-inner">
        <Megaphone size={16} className="broadcast-icon" aria-hidden="true"/>
        <div className="broadcast-content">
          {broadcast.title && <strong className="broadcast-title">{broadcast.title}</strong>}
          <span className="broadcast-message">{broadcast.message}</span>
        </div>
        <button
          className="broadcast-dismiss"
          onClick={() => setBroadcast(null)}
          title="Dismiss"
          aria-label="Dismiss announcement"
        >
          <X size={14}/>
        </button>
      </div>
    </div>
  )
}
