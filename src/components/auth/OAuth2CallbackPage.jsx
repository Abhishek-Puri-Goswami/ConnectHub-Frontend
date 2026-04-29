/*
 * OAuth2CallbackPage.jsx — Landing Page after Google / GitHub OAuth2 Sign-In
 *
 * Purpose:
 *   After the user clicks "Sign in with Google" or "Sign in with GitHub" on the
 *   login page, the browser is sent to the backend's Spring Security OAuth2 endpoint.
 *   Spring Security handles the provider's OAuth2 dance (authorization code exchange,
 *   user profile fetch, account creation/linking) and then redirects the browser back
 *   to this page at /oauth2/callback with query parameters in the URL.
 *
 * How the token handoff works:
 *   The backend appends the following query parameters to the redirect URL:
 *     - token       — the JWT access token
 *     - refreshToken — the JWT refresh token
 *     - userId      — the numeric user ID
 *     - username    — the user's username
 *     - email       — the user's email address
 *   On error, the backend appends:
 *     - error       — a URL-encoded error description
 *
 *   This component reads those parameters using React Router's useSearchParams(),
 *   constructs a minimal user object, stores everything in authStore (and thus
 *   localStorage), then navigates to /chat.
 *
 * Security: cleaning the URL after reading tokens:
 *   After reading the tokens from the query string, we call
 *   window.history.replaceState({}, '', '/oauth2/callback') to remove the
 *   tokens from the browser's address bar. This prevents them from appearing
 *   in browser history, logs, or being visible to the user.
 *
 * Error state:
 *   If the `error` parameter is present, the spinning loader is replaced with
 *   a red error card that explains what went wrong and offers a "Back to sign in"
 *   button. Common errors: account suspended, email already registered with another
 *   provider, or provider denied access.
 *
 * Loading state:
 *   While the useEffect hasn't finished running yet, the component shows a pulsing
 *   animation with a "Signing you in…" message. This is typically only visible for
 *   a fraction of a second before the navigation completes.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { Loader2, AlertCircle, MessageCircle, Mail } from 'lucide-react'
import AuthLayout from './AuthLayout'
import './AuthStyles.css'

export default function OAuth2CallbackPage() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState(null)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  /*
   * Main effect — runs once when the component mounts.
   * Reads all expected query parameters from the URL, validates them,
   * and either completes the login or shows an error.
   */
  useEffect(() => {
    const token = searchParams.get('token')
    const refreshToken = searchParams.get('refreshToken')
    const errorMsg = searchParams.get('error')
    const userId = searchParams.get('userId')
    const username = searchParams.get('username')
    const email = searchParams.get('email')

    /*
     * If the backend included an `error` parameter, the OAuth2 flow failed.
     * We decode it from URL encoding (e.g., %20 → space) and show it to the user.
     */
    if (errorMsg) {
      setError(decodeURIComponent(errorMsg))
      return
    }

    if (token && refreshToken) {
      /*
       * Build a minimal user object from the query parameters.
       * We don't have the full profile yet (avatar, fullName, etc.) but
       * authStore will be refreshed on the next page load from the backend.
       * status and role are set to sensible defaults.
       */
      const user = {
        userId: parseInt(userId),
        username,
        email,
        status: 'ONLINE',
        role: 'USER',
      }
      setAuth(token, refreshToken, user)

      /*
       * Remove tokens from the URL before navigation so they don't appear
       * in browser history. replaceState rewrites the current history entry
       * without triggering a page reload.
       */
      window.history.replaceState({}, '', '/oauth2/callback')
      navigate('/chat', { replace: true })
    } else {
      setError('Authentication failed — no token received')
    }
  }, [searchParams])

  /*
   * Error view — shown when OAuth2 failed (account issue, provider denied, etc.)
   * Displays the decoded error message from the backend and a button to retry.
   */
  if (error) {
    return (
      <AuthLayout tagline="Sign in via OAuth">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--r-xl)',
            background: 'var(--danger-soft)', color: 'var(--danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--clay-shadow)', marginBottom: 16,
          }}>
            <AlertCircle size={34}/>
          </div>
          <h2 className="auth-title" style={{ color: 'var(--danger)' }}>Authentication failed</h2>
          <p className="auth-subtitle">{error}</p>
          {error.toLowerCase().includes('suspend') && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              margin: '16px 0 8px',
              padding: '12px 16px',
              background: 'var(--surface-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              width: '100%',
              boxSizing: 'border-box',
            }}>
              <Mail size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
              <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
                Contact support:{' '}
                <a href="mailto:connecthub.support@gmail.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                  connecthub.support@gmail.com
                </a>
              </span>
            </div>
          )}
          <button className="btn btn-primary btn-block" onClick={() => navigate('/login')} style={{ marginTop: 8 }}>
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    )
  }

  /*
   * Loading view — shown while the useEffect is processing the tokens.
   * The pulsing animation gives visual feedback that something is happening.
   * In practice this is only visible for a few milliseconds.
   */
  return (
    <AuthLayout tagline="Completing your sign-in">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 0' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 'var(--r-xl)',
          background: 'var(--primary-soft)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--clay-shadow)', marginBottom: 16,
          animation: 'pulse 1.6s ease-in-out infinite',
        }}>
          <MessageCircle size={34}/>
        </div>
        <h2 className="auth-title">Signing you in…</h2>
        <p className="auth-subtitle">Securing your session</p>
        <Loader2 size={28} className="spin" style={{ color: 'var(--primary)', marginTop: 12 }}/>
      </div>
    </AuthLayout>
  )
}
