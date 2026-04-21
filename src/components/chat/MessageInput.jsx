/*
 * MessageInput.jsx — Message Composition Bar
 *
 * Purpose:
 *   The input area at the bottom of ChatArea. Allows the user to type and send
 *   text messages, attach files/images, and insert emoji.
 *
 * Layout (matches the design):
 *   [📎 Attach] [ Type a message… (auto-resize textarea) ] [😊 Emoji] [➤ Send]
 *
 * Features:
 *   1. Auto-resize textarea — grows up to 140px as the user types more lines.
 *      Shrinks back when content is cleared after sending.
 *
 *   2. Typing indicator — when the user types, sends a WebSocket "typing: true" event.
 *      After 2.5 seconds of no typing, automatically sends "typing: false" to clear
 *      the indicator on other users' screens. Uses a debounce timeout to avoid
 *      spamming the WebSocket with every single keystroke.
 *
 *   3. Send on Enter — pressing Enter (without Shift) submits the message.
 *      Shift+Enter inserts a newline instead (multi-line message support).
 *
 *   4. File/image upload — clicking the paperclip opens a hidden file input.
 *      On file selection, uploads to the media-service via api.uploadFile(), then
 *      sends a TEXT/IMAGE/FILE message with the returned mediaUrl.
 *      The upload is wrapped with useRateLimit() so the rate-limit toast fires
 *      automatically if the upload bucket is exhausted.
 *
 *   5. Emoji picker — clicking the 😊 button opens the EmojiPicker popup.
 *      Selected emoji is inserted at the current text cursor position (not just appended)
 *      using selectionStart/selectionEnd to place it precisely.
 *
 *   6. Room switching — when roomId changes, the textarea is cleared and the emoji
 *      picker is closed so the user starts fresh in the new room.
 *
 * Props:
 *   onSend(content, type, mediaUrl) — called when a message is ready to send.
 *     ChatArea handles the actual WebSocket publish.
 *   roomId — used to debounce typing indicators per room and for file uploads.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { ws } from '../../services/websocket'
import { api } from '../../services/api'
import { useRateLimit } from '../../utils/useRateLimit'
import { Send, Paperclip, Smile, Loader2, X } from 'lucide-react'
import EmojiPicker from './EmojiPicker'
import './MessageInput.css'

export default function MessageInput({ onSend, roomId }) {
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const fileRef = useRef(null)
  const typingTimeout = useRef(null)
  const textareaRef = useRef(null)

  /*
   * Wrap api.uploadFile with useRateLimit so that if the upload limit is exceeded,
   * the "rateLimitHit" event fires and RateLimitToast shows a notification automatically.
   * The useCallback wrapper stabilizes the function reference so useRateLimit's
   * internal useCallback doesn't re-run on every render.
   */
  const uploadFile = useRateLimit(
    useCallback((file, rid) => api.uploadFile(file, rid), []),
    'uploads'
  )

  /* Clear text and emoji picker when switching rooms */
  useEffect(() => {
    setText('')
    setShowEmoji(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [roomId])

  /* Close emoji picker when Escape is pressed */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setShowEmoji(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /*
   * autoResize — dynamically adjusts textarea height to fit its content.
   * Resets to auto first (collapses to minimum) then sets to scrollHeight,
   * capped at 140px so very long messages don't take over the screen.
   */
  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  /*
   * handleChange — called on every keystroke.
   * Updates the text state, resizes the textarea, and sends a typing indicator.
   * The typing timeout is reset on each keystroke and fires "stop typing" after 2.5s of silence.
   */
  const handleChange = (e) => {
    setText(e.target.value)
    autoResize(e.target)
    ws.sendTyping(roomId, true)
    clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => ws.sendTyping(roomId, false), 2500)
  }

  /*
   * handleSubmit — sends the current text as a TEXT message.
   * Clears the textarea, closes the emoji picker, cancels the typing indicator,
   * and re-focuses the textarea for the next message.
   */
  const handleSubmit = (e) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed, 'TEXT', null)
    setText('')
    setShowEmoji(false)
    ws.sendTyping(roomId, false)
    clearTimeout(typingTimeout.current)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }

  /* handleKeyDown — Enter sends, Shift+Enter adds a newline */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  /*
   * handleFileUpload — uploads the selected file to the media-service.
   * Determines message type from the file's MIME type: image/* → IMAGE, everything else → FILE.
   * After upload, calls onSend with the filename as content and the returned CDN URL as mediaUrl.
   * 429 errors are silently handled by useRateLimit (toast fires). Other errors are logged.
   */
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const media = await uploadFile(file, roomId)
      const type = file.type.startsWith('image/') ? 'IMAGE' : 'FILE'
      onSend(file.name, type, media.url || media.fileUrl || media.mediaUrl)
    } catch (err) {
      if (!err?.message?.includes('429') && !err?.message?.toLowerCase().includes('too many')) {
        console.error('Upload failed:', err)
        alert('Upload Error: ' + err.message + '\n\nIf it says "Internal Server Error", it is usually because the AWS S3 credentials (AWS_ACCESS_KEY_ID) are missing or invalid in docker-compose.yml.')
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /*
   * insertEmoji — inserts the selected emoji at the current text cursor position.
   * Instead of appending to the end, it slices the string at selectionStart/selectionEnd
   * so the emoji lands exactly where the cursor is. Then uses requestAnimationFrame to
   * restore the cursor position just after the inserted emoji.
   */
  const insertEmoji = ({ emoji }) => {
    const ta = textareaRef.current
    if (!ta) { setText(t => t + emoji); return }
    const start = ta.selectionStart ?? text.length
    const end = ta.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      const caret = start + emoji.length
      ta.setSelectionRange(caret, caret)
      autoResize(ta)
    })
  }

  return (
    <div className="mi-wrap">
      {/* Emoji picker popup — floats above the input bar */}
      {showEmoji && (
        <div className="mi-emoji-pop scale-in">
          <div className="mi-emoji-pop-head">
            <span>Pick an emoji</span>
            <button
              className="icon-btn"
              onClick={() => setShowEmoji(false)}
              title="Close"
            >
              <X size={16}/>
            </button>
          </div>
          <EmojiPicker onSelect={insertEmoji} />
        </div>
      )}

      <div className="mi-box">
        {/* Hidden file input — triggered by the paperclip button */}
        <input
          type="file"
          ref={fileRef}
          onChange={handleFileUpload}
          hidden
          accept="image/*,.pdf,.docx,.doc,.xlsx,.zip,.txt"
        />

        {/* Attach button — shows a spinner while uploading */}
        <button
          type="button"
          className="mi-action"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Attach file"
        >
          {uploading
            ? <Loader2 size={18} className="spin"/>
            : <Paperclip size={18}/>}
        </button>

        {/* Auto-resizing textarea */}
        <textarea
          ref={textareaRef}
          className="mi-textarea"
          placeholder="Type a message…"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        {/* Emoji toggle button — highlighted when picker is open */}
        <button
          type="button"
          className={`mi-action emoji ${showEmoji ? 'active' : ''}`}
          onClick={() => setShowEmoji(s => !s)}
          title="Emoji"
        >
          <Smile size={18}/>
        </button>

        {/* Send button — only enabled when there is non-whitespace text */}
        <button
          type="button"
          className={`mi-send ${text.trim() ? 'ready' : ''}`}
          disabled={!text.trim()}
          onClick={handleSubmit}
          title="Send (Enter)"
        >
          <Send size={17}/>
        </button>
      </div>

      {/* Keyboard shortcut hints shown below the input */}
      <div className="mi-hints">
        <span><kbd>Enter</kbd> to send</span>
        <span><kbd>Shift</kbd>+<kbd>Enter</kbd> for newline</span>
      </div>
    </div>
  )
}
