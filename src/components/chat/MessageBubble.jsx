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
import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import {
  Reply, Edit3, Trash2, Smile, Check, CheckCheck,
  MoreHorizontal, Pin, X, Info, Download,
  FileText, FileImage, FileArchive, FileSpreadsheet,
  FileCode, FileAudio, FileVideo, File
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
  
  // First, handle common double-escaped entities
  let decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    
  // Then use DOMParser to handle any remaining valid HTML entities
  try {
    const doc = new DOMParser().parseFromString(decoded, 'text/html')
    return doc.documentElement.textContent || decoded
  } catch (e) {
    return decoded
  }
}

import Avatar from '../common/Avatar'

/*
 * isEmojiOnly — returns true if `text` consists entirely of emoji characters,
 * variation selectors, ZWJ sequences, and optional whitespace.
 *
 * When true, the bubble renders without a background or border ("sticker" style)
 * and the emoji text is displayed at a larger font size so it reads naturally.
 *
 * emojiScale — returns a size class ('xl', 'lg', 'md') based on grapheme count:
 *   1 emoji → xl (44px)  |  2-3 → lg (34px)  |  4+ → md (26px)
 */
const isEmojiOnly = (text) => {
  if (!text?.trim()) return false
  const t = text.trim()
  if (!/\p{Emoji_Presentation}/u.test(t)) return false
  // Fail if there's any character that isn't an emoji, modifier, ZWJ, variation selector, or space
  return !/[^\p{Emoji_Presentation}️‍\u{1F3FB}-\u{1F3FF}\s]/u.test(t)
}

const emojiScale = (text) => {
  try {
    // Intl.Segmenter gives accurate grapheme cluster counts for multi-codepoint emoji
    if (typeof Intl?.Segmenter === 'function') {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      const count = [...seg.segment(text)].filter(s => /\p{Emoji_Presentation}/u.test(s.segment)).length
      if (count <= 1) return 'xl'
      if (count <= 3) return 'lg'
      return 'md'
    }
  } catch { /* fallthrough */ }
  const count = (text.match(/\p{Emoji_Presentation}/gu) || []).length
  if (count <= 1) return 'xl'
  if (count <= 3) return 'lg'
  return 'md'
}

/*
 * getFileIcon — returns the appropriate Lucide icon component for a filename
 * based on its extension. Used in the FILE bubble instead of the 📎 emoji so
 * the icon renders consistently across all platforms with proper sizing/color.
 */
function getFileIcon(filename, size = 16) {
  const ext = (filename || '').split('.').pop().toLowerCase()
  const props = { size, strokeWidth: 2 }
  if (['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff'].includes(ext))
    return <FileImage {...props} />
  if (['mp4','mov','avi','mkv','webm','flv','wmv'].includes(ext))
    return <FileVideo {...props} />
  if (['mp3','wav','ogg','aac','flac','m4a'].includes(ext))
    return <FileAudio {...props} />
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext))
    return <FileArchive {...props} />
  if (['xlsx','xls','csv','ods'].includes(ext))
    return <FileSpreadsheet {...props} />
  if (['js','ts','jsx','tsx','py','java','c','cpp','cs','go','rb','php','html','css','json','xml','sh','yml','yaml'].includes(ext))
    return <FileCode {...props} />
  if (['txt','md','rtf','log'].includes(ext))
    return <FileText {...props} />
  if (['pdf','doc','docx','odt','ppt','pptx'].includes(ext))
    return <FileText {...props} />
  return <File {...props} />
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

const MessageBubble = memo(function MessageBubble({
  message, roomId, isOwn, isRoomAdmin, showAvatar,
  onReply, onEdit, onDelete, onDeleteForMe, onInfo, onPin, highlight
}) {
  const [hov, setHov] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content || '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const inputRef = useRef(null)

  const { user } = useAuthStore()
  const { messageReactions, setReactions, activeRoomId, members, messages } = useChatStore()
  const reactions = messageReactions[message.messageId] || []
  const roomMembers = members[roomId || activeRoomId] || []

  /* Format the sent time as "10:34 AM" shown under the bubble.
   * sentAt from the backend is a bare LocalDateTime string (no Z/offset), so the
   * browser would parse it as local time instead of UTC. Appending Z forces UTC
   * parsing; date-fns then formats it in the user's local timezone. */
  const parseTs = (s) => new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z')
  const time = message.sentAt ? format(parseTs(message.sentAt), 'h:mm a')
    : message.timestamp ? format(new Date(message.timestamp), 'h:mm a')
    : ''

  /*
   * Fetch emoji reactions for this message via REST on mount.
   * WebSocket events will update reactions in real-time via applyReactionEvent()
   * in chatStore, but we need the initial set from the database when first rendering.
   */
  // Only fetch reactions from API if not already cached in store
  useEffect(() => {
    if (!message.messageId) return
    if (messageReactions[message.messageId] !== undefined) return
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
      onMouseLeave={() => { setHov(false); setShowMenu(false); setShowDeleteConfirm(false) }}
    >
      {/* Avatar column — only shows avatar on the first message of a cluster */}
      <div className="mb-av-col">
        {showAvatar ? <Avatar src={senderMember?.avatarUrl} name={senderName} isOwn={isOwn} className="mb-av" /> : <div className="mb-av-spacer"/>}
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
          {message.isDeleted ? (
            /* Deleted message — show placeholder; no editing or options available */
            <div className={`mb-bubble mb-bubble-deleted ${isOwn ? 'own' : 'other'}`}>
              <span className="mb-deleted-text">This message was deleted</span>
            </div>
          ) : editing ? (
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
            /* Normal bubble: renders text, image, or file depending on message type.
               For emoji-only text messages the bubble is rendered transparent ("sticker"). */
            (() => {
              const decoded = decodeHtml(message.content)
              const isTextMsg = message.type === 'TEXT' || !message.type
              const emojiOnly = isTextMsg && isEmojiOnly(decoded)
              const emojiSize = emojiOnly ? emojiScale(decoded) : ''
              return (
                <div className={`mb-bubble ${isOwn ? 'own' : 'other'} ${highlight ? 'hi' : ''} ${emojiOnly ? 'emoji-only' : ''}`}>
                  {message.type === 'IMAGE' && message.mediaUrl && (
                    <div className="mb-img-wrap">
                      <img
                        src={message.thumbnailUrl || message.mediaUrl}
                        alt="attachment"
                        className="mb-img"
                      />
                      <a
                        href={message.mediaUrl}
                        download={decoded || true}
                        className="mb-dl-btn"
                        title="Download"
                        onClick={e => e.stopPropagation()}
                      >
                        <Download size={15}/>
                      </a>
                    </div>
                  )}
                  {message.type === 'FILE' && message.mediaUrl && (
                    <div className="mb-file-wrap">
                      <span className="mb-file-icon">{getFileIcon(decoded)}</span>
                      <span className="mb-file-name">{decoded}</span>
                      <a
                        href={message.mediaUrl}
                        download={decoded || true}
                        className="mb-dl-btn mb-dl-btn--file"
                        title="Download"
                        onClick={e => e.stopPropagation()}
                      >
                        <Download size={15}/>
                      </a>
                    </div>
                  )}
                  {isTextMsg && (
                    <div className={`mb-text ${emojiOnly ? `emoji-only emoji-${emojiSize}` : ''}`}>
                      {decoded}
                    </div>
                  )}
                  {message.isPinned && (
                    <span className="mb-pin-tag"><Pin size={10}/> pinned</span>
                  )}
                </div>
              )
            })()
          )}

          {/* Hover options — hidden for deleted messages */}
          {!editing && !message.isDeleted && (
            <div className="mb-opts">
              {!showMenu && !showDeleteConfirm ? (
                <button
                  className="mb-opt-trigger"
                  onClick={() => setShowMenu(true)}
                  title="Options"
                >
                  <MoreHorizontal size={15}/>
                </button>
              ) : showDeleteConfirm ? (
                /* Delete scope confirmation */
                <div className={`mb-dropdown mb-delete-confirm scale-in ${isOwn ? 'own' : 'other'}`}>
                  <div className="mb-delete-confirm-title">Delete message?</div>
                  {/* "Delete for me" only applies to messages you own — admins deleting others' messages can only delete for everyone */}
                  {isOwn && (
                    <button onClick={() => {
                      onDeleteForMe()
                      setShowDeleteConfirm(false)
                    }}>
                      Delete for me
                    </button>
                  )}
                  <button className="danger" onClick={() => {
                    onDelete()
                    setShowDeleteConfirm(false)
                  }}>
                    Delete for everyone
                  </button>
                  <button className="mb-delete-cancel" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
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
                  {isOwn && onInfo && (
                    <button onClick={() => { onInfo(); setShowMenu(false) }}>
                      <Info size={14}/> Info
                    </button>
                  )}
                  {isRoomAdmin && onPin && (
                    <button onClick={() => { onPin(); setShowMenu(false) }}>
                      <Pin size={14}/> {message.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  {(isOwn || isRoomAdmin) && (
                    <button
                      className="danger"
                      onClick={() => { setShowDeleteConfirm(true); setShowMenu(false) }}
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
            {!message.isDeleted && message.isEdited && <span className="mb-edited">· edited</span>}
            {!message.isDeleted && (
              <StatusTicks
                message={message} isOwn={isOwn}
                roomMembers={roomMembers} userId={user?.userId}
              />
            )}
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
})

export default MessageBubble
