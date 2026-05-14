/*
 * EmptyState.jsx — Welcome Screen (No Room Selected)
 *
 * Shown when activeRoomId is null:
 *   - Right after login
 *   - After a room is deleted
 *   - On mobile when sidebar is open
 *
 * CTA buttons open CreateRoomModal directly from this screen so new
 * users have an immediate path to their first conversation.
 *
 * Shortcuts are intentionally NOT shown here — Ctrl+F / Enter / Esc only
 * work inside an open chat room, so displaying them here would be misleading.
 * They are visible as tooltips on the relevant UI elements inside ChatArea.
 */
import { useState } from 'react'
import { MessageCircle, Menu, Sparkles, Users, Shield, Plus, Zap } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import CreateRoomModal from './CreateRoomModal'
import './EmptyState.css'

export default function EmptyState() {
  const { openSidebar } = useChatStore()
  const [createTab, setCreateTab] = useState('dm')
  const [showCreate, setShowCreate] = useState(false)

  const openDM    = () => { setCreateTab('dm');    setShowCreate(true) }
  const openGroup = () => { setCreateTab('group'); setShowCreate(true) }

  return (
    <div className="empty-wrap clay-lg">
      {showCreate && (
        <CreateRoomModal initialTab={createTab} onClose={() => setShowCreate(false)} />
      )}

      {/* Mobile-only header */}
      <div className="empty-mobile-header">
        <button className="icon-btn" onClick={openSidebar} title="Open sidebar">
          <Menu size={20}/>
        </button>
        <span className="empty-mobile-title">ConnectHub</span>
        <div style={{ width: 38 }}/>
      </div>

      <div className="empty-body">
        {/* Hero icon */}
        <div className="empty-hero-icon">
          <MessageCircle size={56} strokeWidth={1.8}/>
          <span className="empty-hero-sparkle s1"><Sparkles size={18}/></span>
          <span className="empty-hero-sparkle s2"><Sparkles size={14}/></span>
        </div>

        <h1 className="empty-title">Welcome to ConnectHub</h1>
        <p className="empty-sub">
          Pick up where you left off, or start something new.
        </p>

        {/* Primary CTAs */}
        <div className="empty-actions">
          <button className="empty-action-btn primary" onClick={openDM}>
            <MessageCircle size={16}/> New direct message
          </button>
          <button className="empty-action-btn" onClick={openGroup}>
            <Users size={15}/><Plus size={11} style={{ marginLeft: -2 }}/> New group
          </button>
        </div>

        {/* Feature highlights */}
        <div className="empty-features">
          <div className="empty-feature">
            <div className="empty-feature-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              <Zap size={20}/>
            </div>
            <div>
              <div className="empty-feature-title">Real-time messaging</div>
              <div className="empty-feature-sub">Instant delivery with typing indicators</div>
            </div>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon" style={{ background: 'var(--secondary-soft)', color: 'var(--secondary)' }}>
              <Users size={20}/>
            </div>
            <div>
              <div className="empty-feature-title">Groups</div>
              <div className="empty-feature-sub">Create groups with admin controls</div>
            </div>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Shield size={20}/>
            </div>
            <div>
              <div className="empty-feature-title">Secure &amp; private</div>
              <div className="empty-feature-sub">Encrypted sessions with OAuth2</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
