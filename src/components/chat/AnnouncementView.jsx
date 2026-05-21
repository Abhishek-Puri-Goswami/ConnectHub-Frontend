/*
 * AnnouncementView — Read-only announcement detail panel
 * Shown in place of ChatArea when a user clicks an announcement in the sidebar.
 */
import { Megaphone, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import './AnnouncementView.css'

const parseTs = (s) => {
  if (!s) return null
  return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z')
}

export default function AnnouncementView({ announcement, onClose }) {
  if (!announcement) return null
  const ts = announcement.createdAt ? parseTs(announcement.createdAt) : null

  return (
    <div className="av-root">
      <div className="av-header">
        <button className="av-back" onClick={onClose} title="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="av-header-icon">
          <Megaphone size={16} />
        </div>
        <div className="av-header-text">
          <span className="av-header-label">Announcement</span>
          <span className="av-header-from">from {announcement.adminName || 'Admin'}</span>
        </div>
      </div>

      <div className="av-body">
        <div className="av-card">
          <div className="av-card-icon">
            <Megaphone size={22} />
          </div>
          {announcement.title && (
            <h2 className="av-title">{announcement.title}</h2>
          )}
          <div className="av-meta">
            <span className="av-meta-sender">📢 {announcement.adminName || 'Platform Admin'}</span>
            {ts && <span className="av-meta-time">{format(ts, 'MMM d, yyyy · h:mm a')}</span>}
          </div>
          <div className="av-content">
            {announcement.content.split('\n').map((line, i) => (
              <p key={i}>{line || <br />}</p>
            ))}
          </div>
        </div>
        <div className="av-readonly-notice">
          <span>This is a read-only platform announcement. You cannot reply.</span>
        </div>
      </div>
    </div>
  )
}
