/*
 * MessageInfoPanel — Message delivery/read status panel
 *
 * Shows per-member delivery and read receipts for a single message.
 * For DMs: three rows — Sent / Delivered / Read with timestamps.
 * For groups: members grouped under Read / Delivered / Not yet sections.
 *
 * Props:
 *   message     — the message object from chatStore
 *   roomType    — 'DM' or 'GROUP'
 *   roomMembers — array of room members (excludes self, resolved by caller)
 *   onClose     — called when the X button is clicked
 */
import { format } from 'date-fns'
import { X, Check, CheckCheck } from 'lucide-react'
import Avatar from '../common/Avatar'
import './MessageInfoPanel.css'

function fmtTime(iso) {
  if (!iso) return null
  try {
    return format(new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'), 'MMM d, h:mm a')
  } catch { return null }
}

function MemberRow({ member, status, timestamp }) {
  const name = member.fullName || member.username || `User #${member.userId}`
  return (
    <div className="mip-member-row">
      <Avatar src={member.avatarUrl} name={name} className="mip-av" />
      <div className="mip-member-info">
        <span className="mip-member-name">{name}</span>
        {timestamp && <span className="mip-member-time">{fmtTime(timestamp)}</span>}
      </div>
      <div className={`mip-status-icon ${status}`}>
        {status === 'read' && <CheckCheck size={15}/>}
        {status === 'delivered' && <CheckCheck size={15}/>}
        {status === 'sent' && <Check size={15}/>}
      </div>
    </div>
  )
}

export default function MessageInfoPanel({ message, roomType, roomMembers, onClose }) {
  const readReceipts = message.readReceipts || {}
  const readBy = message.readBy || []

  if (roomType === 'DM') {
    const other = roomMembers[0]
    const isRead = other && readBy.includes(other.userId)
    const isDelivered = message.deliveryStatus === 'DELIVERED' || message.deliveryStatus === 'READ'
    const readTime = other ? readReceipts[other.userId] : null
    return (
      <div className="mip-overlay" onClick={onClose}>
        <div className="mip-panel scale-in" onClick={e => e.stopPropagation()}>
          <div className="mip-header">
            <span className="mip-title">Message info</span>
            <button className="icon-btn" onClick={onClose}><X size={16}/></button>
          </div>
          <div className="mip-dm-rows">
            <div className="mip-dm-row">
              <div className="mip-dm-icon sent"><Check size={15}/></div>
              <div className="mip-dm-label">Sent</div>
              <div className="mip-dm-time">{fmtTime(message.sentAt) || 'Just now'}</div>
            </div>
            <div className={`mip-dm-row ${!isDelivered ? 'muted' : ''}`}>
              <div className={`mip-dm-icon delivered ${!isDelivered ? 'inactive' : ''}`}><CheckCheck size={15}/></div>
              <div className="mip-dm-label">Delivered</div>
              <div className="mip-dm-time">{isDelivered ? (fmtTime(message.deliveredAt) || '—') : '—'}</div>
            </div>
            <div className={`mip-dm-row ${!isRead ? 'muted' : ''}`}>
              <div className={`mip-dm-icon read ${!isRead ? 'inactive' : ''}`}><CheckCheck size={15}/></div>
              <div className="mip-dm-label">Read</div>
              <div className="mip-dm-time">{isRead ? (fmtTime(readTime) || '—') : '—'}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Group: bucket each other member into read / delivered / not yet
  const readMembers = []
  const deliveredMembers = []
  const pendingMembers = []

  roomMembers.forEach(m => {
    if (readBy.includes(m.userId)) {
      readMembers.push({ member: m, timestamp: readReceipts[m.userId] || null })
    } else if (message.deliveryStatus === 'DELIVERED' || message.deliveryStatus === 'READ') {
      deliveredMembers.push({ member: m, timestamp: message.deliveredAt || null })
    } else {
      pendingMembers.push({ member: m })
    }
  })

  return (
    <div className="mip-overlay" onClick={onClose}>
      <div className="mip-panel scale-in" onClick={e => e.stopPropagation()}>
        <div className="mip-header">
          <span className="mip-title">Message info</span>
          <button className="icon-btn" onClick={onClose}><X size={16}/></button>
        </div>

        {readMembers.length > 0 && (
          <div className="mip-section">
            <div className="mip-section-label read">Read</div>
            {readMembers.map(({ member, timestamp }) => (
              <MemberRow key={member.userId} member={member} status="read" timestamp={timestamp}/>
            ))}
          </div>
        )}

        {deliveredMembers.length > 0 && (
          <div className="mip-section">
            <div className="mip-section-label delivered">Delivered</div>
            {deliveredMembers.map(({ member, timestamp }) => (
              <MemberRow key={member.userId} member={member} status="delivered" timestamp={timestamp}/>
            ))}
          </div>
        )}

        {pendingMembers.length > 0 && (
          <div className="mip-section">
            <div className="mip-section-label pending">Not yet</div>
            {pendingMembers.map(({ member }) => (
              <MemberRow key={member.userId} member={member} status="sent" timestamp={null}/>
            ))}
          </div>
        )}

        {roomMembers.length === 0 && (
          <div className="mip-empty">No delivery info yet</div>
        )}

        <div className="mip-sent-row">
          <span className="mip-sent-label">Sent</span>
          <span className="mip-sent-time">{fmtTime(message.sentAt) || 'Just now'}</span>
        </div>
      </div>
    </div>
  )
}
