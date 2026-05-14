/*
 * JoinRoomPage.jsx — Room Invite Link Handler
 *
 * Purpose:
 *   Landing page for invite links (/join/:code).
 *   Fetches and displays room info (name, avatar, member count, description,
 *   private/public badge) BEFORE the user commits to joining — so they know
 *   what they're joining.
 *
 * Flow:
 *   1. Extract invite code from URL (:code param)
 *   2. GET /rooms/join/:code  → fetch RoomPreviewDto (no membership required)
 *   3. Show room card with all info and a "Join group" button
 *   4. On click: POST /rooms/join/:code  → add user as MEMBER
 *   5. On success: reload rooms list, navigate to the new room in /chat
 *
 * Edge cases handled:
 *   - Invalid / revoked code → show clear error on preview load
 *   - Already a member → joinByInviteCode is idempotent (backend returns existing
 *     membership); we treat it as success and navigate to the room
 *   - Preview fetch while loading → skeleton pulse animation
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useChatStore } from '../../store/chatStore'
import { useAuthStore } from '../../store/authStore'
import { Users, Loader2, LogIn, ArrowLeft, Lock, Hash, AlertCircle } from 'lucide-react'
import './JoinRoomPage.css'

export default function JoinRoomPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { setRooms, setActiveRoom } = useChatStore()

  const [preview, setPreview]         = useState(null)   // RoomPreviewDto
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError]     = useState('')

  const [joining, setJoining]   = useState(false)
  const [joinError, setJoinError] = useState('')

  /* Fetch room preview on mount */
  useEffect(() => {
    api.getRoomPreviewByCode(code)
      .then(setPreview)
      .catch(e => setPreviewError(e.message || 'Invalid or expired invite link.'))
      .finally(() => setPreviewLoading(false))
  }, [code])

  const handleJoin = async () => {
    setJoining(true)
    setJoinError('')
    try {
      const member = await api.joinByInviteCode(code)
      // Reload the full room list so the new room appears in the sidebar
      const rooms = await api.getUserRooms(user.userId)
      const sorted = rooms.sort((a, b) =>
        new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
      )
      setRooms(sorted)
      if (member?.roomId) setActiveRoom(member.roomId)
      navigate('/chat', { replace: true })
    } catch (e) {
      setJoinError(e.message || 'Could not join the group. The link may have expired.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="join-page">
      <div className="join-card clay-lg">
        {/* Back link */}
        <button className="join-back" onClick={() => navigate('/chat')}>
          <ArrowLeft size={15}/> Back to Chat
        </button>

        {previewLoading && (
          <div className="join-skeleton">
            <div className="join-skeleton-av pulse"/>
            <div className="join-skeleton-line pulse" style={{ width: '60%' }}/>
            <div className="join-skeleton-line pulse" style={{ width: '40%' }}/>
          </div>
        )}

        {previewError && !previewLoading && (
          <div className="join-error-state">
            <div className="join-error-icon">
              <AlertCircle size={32}/>
            </div>
            <h2 className="join-error-title">Invalid invite link</h2>
            <p className="join-error-sub">{previewError}</p>
            <button className="btn btn-primary" onClick={() => navigate('/chat')}>
              Go to Chat
            </button>
          </div>
        )}

        {preview && !previewLoading && (
          <>
            {/* Room avatar */}
            <div className="join-avatar-wrap">
              {preview.avatarUrl ? (
                <img src={preview.avatarUrl} alt={preview.name} className="join-avatar join-avatar-img"/>
              ) : (
                <div className="join-avatar join-avatar-initials">
                  {(preview.name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Room info */}
            <h2 className="join-room-name">{preview.name}</h2>

            <div className="join-badges">
              <span className={`join-badge ${preview.isPrivate ? 'private' : 'public'}`}>
                {preview.isPrivate ? <Lock size={11}/> : <Hash size={11}/>}
                {preview.isPrivate ? 'Private group' : 'Public group'}
              </span>
              <span className="join-badge members">
                <Users size={11}/>
                {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>

            {preview.description && (
              <p className="join-description">{preview.description}</p>
            )}

            {joinError && (
              <p className="join-join-error">
                <AlertCircle size={13}/> {joinError}
              </p>
            )}

            <button
              className="btn btn-primary join-btn"
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? <Loader2 size={17} className="spin"/> : <LogIn size={17}/>}
              {joining ? 'Joining…' : 'Join group'}
            </button>

            <p className="join-fine-print">
              You were invited via a shared link. By joining you accept the group's rules.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
