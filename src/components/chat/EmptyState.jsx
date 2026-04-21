/*
 * EmptyState.jsx — Welcome Screen (No Room Selected)
 *
 * Purpose:
 *   Shown in the right panel of ChatLayout when no room is currently open.
 *   Displays the app name, a brief description, a feature highlights list,
 *   and keyboard shortcut hints.
 *
 * When is it shown?
 *   ChatLayout renders EmptyState when activeRoomId is null. This happens:
 *   - Right after login, before the user clicks any room.
 *   - After a room is deleted and the user is no longer in any room.
 *   - On mobile, when the sidebar is open and no room is selected.
 *
 * Mobile header:
 *   On mobile, the sidebar overlays the chat area. The EmptyState renders a
 *   minimal header with a hamburger menu button (openSidebar) so the user can
 *   open the sidebar without having a chat area header to click.
 *
 * Feature highlights:
 *   Three cards briefly explain the main capabilities:
 *   - Instant messaging (real-time + typing indicators)
 *   - Group rooms (channels with admin controls)
 *   - Secure & private (OAuth2 + encrypted sessions)
 *
 * Keyboard shortcuts reference:
 *   A compact shortcut cheatsheet at the bottom — Ctrl+F for search,
 *   Enter to send, Shift+Enter for newline, Esc to dismiss panels.
 */
import { MessageCircle, Menu, Sparkles, Users, Shield } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import './EmptyState.css'

export default function EmptyState() {
  const { openSidebar } = useChatStore()

  return (
    <div className="empty-wrap clay-lg">
      {/* Mobile-only header: hamburger button to open the sidebar */}
      <div className="empty-mobile-header">
        <button className="icon-btn" onClick={openSidebar} title="Open sidebar">
          <Menu size={20}/>
        </button>
        <span className="empty-mobile-title">ConnectHub</span>
        <div style={{ width: 38 }}/>
      </div>

      <div className="empty-body">
        {/* Hero icon with decorative sparkles */}
        <div className="empty-hero-icon">
          <MessageCircle size={56} strokeWidth={1.8}/>
          <span className="empty-hero-sparkle s1"><Sparkles size={18}/></span>
          <span className="empty-hero-sparkle s2"><Sparkles size={14}/></span>
        </div>
        <h1 className="empty-title">Welcome to ConnectHub</h1>
        <p className="empty-sub">
          Select a chat from the sidebar to start messaging,<br/>
          or start a new conversation to connect with someone.
        </p>

        {/* Feature highlights grid */}
        <div className="empty-features">
          <div className="empty-feature">
            <div className="empty-feature-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              <MessageCircle size={20}/>
            </div>
            <div>
              <div className="empty-feature-title">Instant messaging</div>
              <div className="empty-feature-sub">Real-time delivery & typing indicators</div>
            </div>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon" style={{ background: 'var(--secondary-soft)', color: 'var(--secondary)' }}>
              <Users size={20}/>
            </div>
            <div>
              <div className="empty-feature-title">Group rooms</div>
              <div className="empty-feature-sub">Create channels with admin controls</div>
            </div>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Shield size={20}/>
            </div>
            <div>
              <div className="empty-feature-title">Secure & private</div>
              <div className="empty-feature-sub">Encrypted sessions with OAuth2</div>
            </div>
          </div>
        </div>

        {/* Keyboard shortcut reference for power users */}
        <div className="empty-shortcuts">
          <div><kbd>Ctrl</kbd>+<kbd>F</kbd> Search</div>
          <div><kbd>Enter</kbd> Send message</div>
          <div><kbd>Shift</kbd>+<kbd>Enter</kbd> New line</div>
          <div><kbd>Esc</kbd> Dismiss</div>
        </div>
      </div>
    </div>
  )
}
