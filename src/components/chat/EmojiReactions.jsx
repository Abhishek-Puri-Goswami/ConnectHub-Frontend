/*
 * EmojiReactions.jsx — Message Emoji Reaction Chips
 *
 * Purpose:
 *   Renders the emoji reaction chips below a message bubble (e.g., "👍 3", "❤️ 1")
 *   and handles adding/removing reactions via both REST and WebSocket.
 *
 * How reactions work:
 *   1. MessageBubble fetches the initial reactions for a message via api.getReactions()
 *      and stores them in chatStore.messageReactions[messageId].
 *   2. This component receives the reactions array as a prop and groups them by emoji,
 *      counting how many users used each one and flagging which ones the current user picked.
 *   3. When the user clicks a chip or selects an emoji from the picker:
 *      a. Checks if the user already has a different reaction — removes it first (one reaction per user).
 *      b. Immediately applies an optimistic update to chatStore (so the UI responds instantly).
 *      c. Calls the REST API to persist the change.
 *      d. Sends a WebSocket event so other users see the change in real time.
 *      e. If the API call fails, rolls back the optimistic update.
 *   4. Incoming WebSocket reaction events from others are handled by chatStore.applyReactionEvent(),
 *      not by this component directly.
 *
 * ALL_EMOJIS defines the quick-react panel (20 common reactions). Users can also open
 * a full EmojiPicker via MessageBubble's "React" dropdown option.
 *
 * Props:
 *   messageId       — ID of the message these reactions belong to
 *   roomId          — used for the WebSocket sendReaction call
 *   reactions       — flat array of { userId, emoji } objects from chatStore
 *   showPicker      — boolean controlling the compact emoji panel visibility
 *   onTogglePicker  — callback to toggle the showPicker state in MessageBubble
 */
import { api } from '../../services/api'
import { ws } from '../../services/websocket'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { Plus } from 'lucide-react'
import './EmojiReactions.css'

const ALL_EMOJIS = ['👍','👎','❤️','😂','😮','😢','😡','🔥','🎉','👀','💯','✅','❌','🤔','👏','🙏','💪','🫡','⭐','💀']

export default function EmojiReactions({ messageId, roomId, reactions = [], showPicker, onTogglePicker }) {
  const { user } = useAuthStore()
  const { applyReactionEvent } = useChatStore()

  /*
   * Group the flat reactions array into an object keyed by emoji.
   * Each entry: { emoji, count, userIds[], mine: boolean }
   * The `mine` flag is true if the current user has this reaction, which causes
   * the chip to be highlighted with the .mine CSS class.
   */
  const grouped = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, count: 0, userIds: [], mine: false }
    acc[r.emoji].count++
    acc[r.emoji].userIds.push(r.userId)
    if (r.userId === user?.userId) acc[r.emoji].mine = true
    return acc
  }, {})

  /*
   * handleReact(emoji) — toggles a reaction on or off for the current user.
   *
   * Optimistic update pattern:
   *   - Apply the state change locally BEFORE the API call so the UI feels instant.
   *   - If the API call fails, revert the local state (apply the inverse action).
   *
   * One-reaction-per-user enforcement:
   *   If the user already has a DIFFERENT emoji reaction on this message, we remove it first
   *   before adding the new one — both locally and via REST/WebSocket.
   */
  const handleReact = async (emoji) => {
    if (!messageId) return
    const existing = grouped[emoji]
    const action = existing?.mine ? 'REMOVE' : 'ADD'
    try {
      if (action === 'ADD') {
        const prevEmoji = Object.keys(grouped).find(e => grouped[e].mine)
        if (prevEmoji && prevEmoji !== emoji) {
          applyReactionEvent(messageId, user.userId, prevEmoji, 'REMOVE')
          api.removeReaction(messageId, prevEmoji).catch(() => {})
          ws.sendReaction(roomId, messageId, prevEmoji, 'REMOVE')
        }
      }
      applyReactionEvent(messageId, user.userId, emoji, action)
      if (action === 'REMOVE') await api.removeReaction(messageId, emoji)
      else await api.addReaction(messageId, emoji)
      ws.sendReaction(roomId, messageId, emoji, action)
    } catch (e) {
      /* Rollback: apply the inverse action to undo the optimistic update */
      applyReactionEvent(messageId, user.userId, emoji, action === 'ADD' ? 'REMOVE' : 'ADD')
      console.error('Reaction failed:', e)
    }
    onTogglePicker(false)
  }

  /* Don't render anything if there are no reactions and the picker is closed */
  if (Object.values(grouped).length === 0 && !showPicker) return null

  return (
    <div className="rx-wrap">
      {/* Reaction chips — one pill per unique emoji with count */}
      {Object.values(grouped).length > 0 && (
        <div className="rx-chips">
          {Object.values(grouped).map(r => (
            <button
              key={r.emoji}
              className={`rx-chip ${r.mine ? 'mine' : ''}`}
              onClick={() => handleReact(r.emoji)}
            >
              <span className="rx-emoji">{r.emoji}</span>
              <span className="rx-count">{r.count}</span>
            </button>
          ))}
          {/* + button to open the quick-reaction panel */}
          <button className="rx-chip rx-add" onClick={() => onTogglePicker(!showPicker)}>
            <Plus size={13}/>
          </button>
        </div>
      )}

      {/* Compact emoji panel — a grid of 20 common reactions */}
      {showPicker && (
        <div className="rx-picker scale-in">
          <div className="rx-picker-grid">
            {ALL_EMOJIS.map(e => (
              <button key={e} className="rx-picker-btn" onClick={() => handleReact(e)}>{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
