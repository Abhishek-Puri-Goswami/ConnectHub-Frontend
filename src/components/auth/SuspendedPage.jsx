import { ShieldOff, Mail, LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'

export default function SuspendedPage() {
  const { clearAuth } = useAuthStore()

  const handleLogout = async () => {
    try { await api.logout() } catch {}
    clearAuth()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '16px',
      overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: '20px',
        padding: 'clamp(24px, 6vw, 48px) clamp(18px, 5vw, 40px)',
        maxWidth: '440px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          color: '#ef4444',
        }}>
          <ShieldOff size={32} />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>
          Account Suspended
        </h1>
        <p style={{ color: 'var(--text-soft)', lineHeight: 1.6, marginBottom: 28, fontSize: '0.95rem' }}>
          Your account has been suspended due to a policy violation or at the request of a platform administrator.
          You are unable to access ConnectHub at this time.
        </p>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
        }}>
          <Mail size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              Contact Support
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              If you believe this is a mistake, email us at{' '}
              <span style={{ color: 'var(--accent)' }}>support@connecthub.app</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '11px 20px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-soft)',
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )
}
