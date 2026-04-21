/*
 * TypingIndicator.jsx — "Someone is typing..." Animation
 *
 * Purpose:
 *   Shown below the message list in ChatArea when one or more users are actively
 *   typing. Displays a small avatar, three animated bouncing dots, and a text label.
 *
 * How the typing data flows to this component:
 *   1. User A types → MessageInput calls ws.sendTyping(roomId, true).
 *   2. The WebSocket backend broadcasts the typing event to all room subscribers.
 *   3. ChatArea's onTyping WebSocket callback calls chatStore.setTyping(roomId, userId, username).
 *   4. ChatArea reads typingUsers[roomId] from the store, filters out the current user,
 *      and passes the remaining usernames as the `users` prop to this component.
 *   5. The typing entry auto-expires after 4 seconds (set in ChatArea) if no "stop typing"
 *      event is received (handles the case where the user closes the tab while typing).
 *
 * Text format for the label:
 *   1 user   → "Alice is typing"
 *   2 users  → "Alice and Bob are typing"
 *   3+ users → "Alice and 2 others are typing"
 *
 * Props:
 *   users (string[]) — array of display names of users currently typing
 */
import './TypingIndicator.css'

export default function TypingIndicator({ users }) {
  /*
   * Build the descriptive text based on how many people are typing.
   * Only the first user's name is shown; others are collapsed into "N others".
   */
  const text = users.length === 1 ? `${users[0]} is typing`
    : users.length === 2 ? `${users[0]} and ${users[1]} are typing`
    : `${users[0]} and ${users.length - 1} others are typing`

  /* Show the first two characters of the first typer's name as the avatar initial */
  const initials = (users[0] || '?').slice(0, 2).toUpperCase()

  return (
    <div className="typing-wrap">
      {/* Avatar circle with the typer's initials */}
      <div className="typing-av">{initials}</div>

      {/* Three dots with staggered animation delays create the bouncing effect */}
      <div className="typing-bubble">
        <span className="typing-dot" style={{ animationDelay: '0ms' }}/>
        <span className="typing-dot" style={{ animationDelay: '180ms' }}/>
        <span className="typing-dot" style={{ animationDelay: '360ms' }}/>
      </div>

      {/* Descriptive text: "Alice is typing" */}
      <span className="typing-text">{text}</span>
    </div>
  )
}
