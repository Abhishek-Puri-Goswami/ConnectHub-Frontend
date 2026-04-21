/*
 * MessageBubble.jsx — Individual Chat Message Renderer
 *
 * Purpose:
 *   Renders a single chat message with its avatar, sender name, content (text/image/file),
 *   reply context, emoji reactions, delivery status ticks, and a hover action menu
 *   for reply, edit, delete, and react.
 *
 * Layout (one row):
 *   [Avatar]  [Sender name (first in cluster only)]
 *             [Reply context (quoted message, if this is a reply)]
 *             [Message bubble: text | image | file attachment]
 *             [Hover menu: ... → Reply / React / Edit / Delete]
 *             [Time · edited · ✓✓ ticks]
 *             [Emoji reaction chips]
 *
 * Key behaviors:
 *   - Hover shows a three-dot button. Clicking it opens a dropdown with actions.
 *   - Edit mode replaces the bubble with an inline text input; Enter saves, Escape cancels.
 *   - Images are shown inline (using thumbnailUrl if available, falling back to full mediaUrl).
 *   - File attachments are shown as a clickable link with a 📎 icon.
 *   - Reply context shows a small quoted preview of the original message above the bubble.
 *     The original message is looked up in the chatStore's messages array by replyToMessageId.
 *   - Reactions are loaded from the API on mount and then updated in real time via
 *     chatStore.applyReactionEvent() when WebSocket reaction events arrive.
 *
 * decodeHtml(text) — exported utility that strips HTML entities (&amp; → &, etc.)
 *   that the backend escapes before storing, so the UI shows the original text.
 *
 * StatusTicks — shows delivery/read state for own messages:
 *   ✓  (single) — SENT (message left the client)
 *   ✓✓ (grey)  — DELIVERED (server received it)
 *   ✓✓ (blue)  — READ (all other room members have seen it)
 *
 * Avatar — a colored circle with the sender's initial, using a deterministic color
 *   palette so each user always has the same color across the whole app.
 *
 * Props:
 *   message     — the message object from chatStore
 *   roomId      — used to look up room members and reactions in the store
 *   isOwn       — true if message.senderId === current user's ID
 *   showAvatar  — true if this is the first message in a sender cluster
 *   onReply     — called when "Reply" is clicked
 *   onEdit(content) — called with the new text when an edit is saved
 *   onDelete    — called when "Delete" is clicked
 *   highlight   — true if this message is highlighted (e.g., from search)
 */
import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import {
  Reply, Edit3, Trash2, Smile, Check, CheckCheck,
  MoreHorizontal, Pin, X
} from 'lucide-react'
import EmojiReactions from './EmojiReactions'
import './MessageBubble.css'

/*
 * decodeHtml(text) — converts HTML entities back to their original characters.
 * The backend runs HtmlUtils.htmlEscape() on message content before saving to prevent
 * XSS. This function reverses that by parsing the string through a DOMParser.
 * Exported so ChatArea can also use it in the reply preview and pinned bar.
 */
export const decodeHtml = (text) => {
  if (!text) return ''
  const doc = new DOMParser().parseFromString(text, 'text/html')
  return doc.documentElement.textContent || ''
}

const PALETTE = ['#FF8E72','#7AC9A7','#B8A4F4','#FFB547','#F47174','#6BCEEA','#FF9F87','#9D8FF5']

/*
 * Avatar — a small colored circle showing the sender's initial letter.
 * For own messages: uses a CSS gradient matching the primary theme color.
 * For others: picks a color from PALETTE based on the first character of their name,
 * so the same person always has the same color regardless of where they appear in the app.
 */
function Avatar({ name, isOwn }) {
  const bg = isOwn
    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)'
    : PALETTE[(String(name).charCodeAt(0) || 0) % PALETTE.length]
  const initial = typeof name === 'string' && name ? name.charAt(0).toUpperCase() : '?'
  return (
    <div className="mb-av" style={{ background: bg }}>
      {initial}
    </div>
  )
}

/*
 * StatusTicks — delivery/read status indicator for own messages only.
 *
 * The effective status is determined by checking the message's readBy array against
 * the room's member list. If all other members are in readBy, it shows READ (blue ✓✓).
 * Otherwise falls back to the message's deliveryStatus field (SENT / DELIVERED).
 *
 * Only shown for own messages (isOwn=true). Received messages don't show ticks.
 */
function StatusTicks({ message, isOwn, roomMembers, userId }) {
  if (!isOwn) return null
  const status = message.deliveryStatus || 'SENT'
  const readBy = message.readBy || []
  const others = roomMembers.filter(m => m.userId !== userId)
  const allRead = others.length > 0 && others.every(m => readBy.includes(m.userId))
  const effective = allRead || status === 'READ' ? 'READ' : status

  if (effective === 'READ')
    return <span className="mb-ticks read" title="Seen"><CheckCheck size={14}/></span>
  if (effective === 'DELIVERED')
    return <span className="mb-ticks delivered" title="Delivered"><CheckCheck size={14}/></span>
  return <span className="mb-ticks sent" title="Sent"><Check size={14}/></span>
}

export default function MessageBubble({
  message, roomId, isOwn, showAvatar,
  onReply, onEdit, onDelete, highlight
}) {
  const [hov, setHov] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content || '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef(null)

  const { user } = useAuthStore()
  const { messageReactions, setReactions, activeRoomId, members, messages } = useChatStore()
  const reactions = messageReactions[message.messageId] || []
  const roomMembers = members[roomId || activeRoomId] || []

  /* Format the sent time as "10:34 AM" shown under the bubble */
  const time = message.sentAt ? format(new Date(message.sentAt), 'h:mm a')
    : message.timestamp ? format(new Date(message.timestamp), 'h:mm a')
    : ''

  /*
   * Fetch emoji reactions for this message via REST on mount.
   * WebSocket events will update reactions in real-time via applyReactionEvent()
   * in chatStore, but we need the initial set from the database when first rendering.
   */
  useEffect(() => {
    if (!message.messageId) return
    api.getReactions(message.messageId)
      .then(data => setReactions(message.messageId, data))
      .catch(() => {})
  }, [message.messageId])

  /* Auto-focus the inline edit input when editing mode is entered */
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  /* handleSaveEdit — only calls onEdit if the content actually changed */
  const handleSaveEdit = () => {
    const trimmed = (editText || '').trim()
    if (trimmed && trimmed !== message.content) onEdit(trimmed)
    setEditing(false)
  }

  /*
   * Resolve the sender's display name for this message.
   * Looks up the sender in the room's member list (which has enriched profile data).
   * Falls back to the message's senderUsername field, then to "User #id".
   */
  const senderMember = roomMembers.find(m => m.userId === message.senderId)
  const senderName = senderMember?.fullName
    || senderMember?.username
    || message.senderUsername
    || `User #${message.senderId}`

  /*
   * Resolve the reply-to context for display above the bubble.
   * The message object may include replyToContent and replyToSenderUsername directly,
   * but if not, we look up the original message in the store by replyToMessageId.
   */
  let rContent = message.replyToContent
  let rAuthor = message.replyToSenderUsername
  if (message.replyToMessageId) {
    const rm = messages[roomId || activeRoomId] || []
    const orig = rm.find(m => m.messageId === message.replyToMessageId)
    if (orig) {
      rContent = rContent || orig.content
      const origMem = roomMembers.find(m => m.userId === orig.senderId)
      rAuthor = rAuthor || origMem?.fullName || origMem?.username
        || orig.senderUsername || `User #${orig.senderId}`
    }
  }

  return (
    <div
      className={`mb-row ${isOwn ? 'own' : 'other'} ${showAvatar ? 'with-av' : ''} ${highlight ? 'hi' : ''}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setShowMenu(false) }}
    >
      {/* Avatar column — only shows avatar on the first message of a cluster */}
      <div className="mb-av-col">
        {showAvatar ? <Avatar name={senderName} isOwn={isOwn} /> : <div className="mb-av-spacer"/>}
      </div>

      <div className="mb-col">
        {/* Sender name — only shown at the top of a cluster, and only for received messages */}
        {showAvatar && !isOwn && (
          <div className="mb-sender-name">{senderName}</div>
        )}

        {/* Reply context — quoted preview of the original message */}
        {message.replyToMessageId && (
          <div className={`mb-reply-ctx ${isOwn ? 'own' : 'other'}`}>
            <span className="mb-reply-bar"/>
            <div className="mb-reply-body">
              <span className="mb-reply-author">{rAuthor || 'Someone'}</span>
              <span className="mb-reply-text">
                {decodeHtml(rContent?.slice(0, 80)) || 'Original message'}
                {rContent && rContent.length > 80 ? '…' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Message bubble + hover options */}
        <div className="mb-bubble-row">
          {editing ? (
            /* Inline edit mode: input replaces the bubble */
            <div className="mb-edit-box">
              <input
                ref={inputRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveEdit()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="mb-edit-input"
              />
              <div className="mb-edit-actions">
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                  <X size={14}/> Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveEdit}>
                  <Check size={14}/> Save
                </button>
              </div>
            </div>
          ) : (
            /* Normal bubble: renders text, image, or file depending on message type */
            <div className={`mb-bubble ${isOwn ? 'own' : 'other'} ${highlight ? 'hi' : ''}`}>
              {message.type === 'IMAGE' && message.mediaUrl && (
                <img
                  src={message.thumbnailUrl || message.mediaUrl}
                  alt="attachment"
                  className="mb-img"
                />
              )}
              {message.type === 'FILE' && message.mediaUrl && (
                <a
                  href={message.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-file"
                >
                  📎 {decodeHtml(message.content)}
                </a>
              )}
              {(message.type === 'TEXT' || !message.type) && (
                <div className="mb-text">{decodeHtml(message.content)}</div>
              )}
              {message.isPinned && (
                <span className="mb-pin-tag"><Pin size={10}/> pinned</span>
              )}
            </div>
          )}

          {/* Hover options — three-dot button appears on hover, opens a dropdown on click */}
          {(hov || showMenu) && !editing && (
            <div className="mb-opts">
              {!showMenu ? (
                <button
                  className="mb-opt-trigger"
                  onClick={() => setShowMenu(true)}
                  title="Options"
                >
                  <MoreHorizontal size={15}/>
                </button>
              ) : (
                <div className={`mb-dropdown scale-in ${isOwn ? 'own' : 'other'}`}>
                  <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowMenu(false) }}>
                    <Smile size={14}/> React
                  </button>
                  <button onClick={() => { onReply(); setShowMenu(false) }}>
                    <Reply size={14}/> Reply
                  </button>
                  {isOwn && (
                    <button onClick={() => {
                      setEditing(true)
                      setEditText(decodeHtml(message.content))
                      setShowMenu(false)
                    }}>
                      <Edit3 size={14}/> Edit
                    </button>
                  )}
                  {isOwn && (
                    <button
                      className="danger"
                      onClick={() => { onDelete(); setShowMenu(false) }}
                    >
                      <Trash2 size={14}/> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Time, "edited" label, and delivery ticks — shown below the bubble */}
        {!editing && (
          <div className="mb-meta">
            <span className="mb-time">{time}</span>
            {message.isEdited && <span className="mb-edited">· edited</span>}
            <StatusTicks
              message={message} isOwn={isOwn}
              roomMembers={roomMembers} userId={user?.userId}
            />
          </div>
        )}

        {/* Emoji reaction chips — rendered below the meta row */}
        <EmojiReactions
          messageId={message.messageId}
          roomId={message.roomId || activeRoomId}
          reactions={reactions}
          showPicker={showEmojiPicker}
          onTogglePicker={setShowEmojiPicker}
        />
      </div>
    </div>
  )
}
