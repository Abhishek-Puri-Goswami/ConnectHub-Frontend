/*
 * App.jsx — Root Application Component and Route Definitions
 *
 * This is the top-level component that sets up:
 *
 * 1. ThemeProvider — wraps the entire app so every component can access
 *    the current theme (light/dark) through the useTheme() hook.
 *
 * 2. BrowserRouter — enables React Router's client-side navigation so users
 *    can move between pages (login, chat, billing, etc.) without a full page reload.
 *
 * 3. Route guards:
 *    - ProtectedRoute: checks if an access token exists in the store.
 *      If the user is NOT logged in, it redirects them to /login.
 *      Used for pages that require authentication (chat, billing, admin).
 *    - PublicRoute: does the opposite — if the user IS already logged in,
 *      redirect them away from auth pages (login, register) to /chat.
 *
 * Route map:
 *   /login           → LoginPage       (public only)
 *   /register        → RegisterPage    (public only)
 *   /forgot-password → ForgotPasswordPage (public only)
 *   /verify-email    → VerifyEmailPage (public only — after register)
 *   /oauth2/callback → OAuth2CallbackPage (no guard — handles Google/GitHub redirect)
 *   /admin           → AdminDashboard  (protected — ADMIN role enforced on backend too)
 *   /billing         → BillingPage     (protected)
 *   /chat/*          → ChatLayout      (protected)
 *   *                → redirect to /chat (catch-all)
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { ThemeProvider } from './theme/ThemeContext'
import { ws } from './services/websocket'
import LoginPage from './components/auth/LoginPage'
import RegisterPage from './components/auth/RegisterPage'
import VerifyEmailPage from './components/auth/VerifyEmailPage'
import ForgotPasswordPage from './components/auth/ForgotPasswordPage'
import OAuth2CallbackPage from './components/auth/OAuth2CallbackPage'
import SuspendedPage from './components/auth/SuspendedPage'
import ToastContainer from './components/layout/ToastContainer'
import BroadcastBanner from './components/common/BroadcastBanner'
import HomePage from './components/marketing/HomePage'

/*
 * WebSocketKeepAlive — keeps the WebSocket open for any authenticated page,
 * not just /chat. This means admins on /admin still receive platform broadcasts,
 * and the connection is ready instantly when navigating to /chat.
 * connect() is idempotent — ChatLayout calling it again is a no-op.
 */
function WebSocketKeepAlive() {
  const token = useAuthStore(s => s.token)
  useEffect(() => {
    if (!token) return
    ws.connect(token).catch(() => {})
    return () => {
      // Only disconnect if ChatLayout isn't mounted (it handles its own cleanup).
      // We do a small delay so ChatLayout's own cleanup fires first on route change.
      setTimeout(() => { if (!token) ws.disconnect() }, 200)
    }
  }, [token])
  return null
}

// Lazy-load heavy routes so their JS is only downloaded when needed
const ChatLayout = lazy(() => import('./components/layout/ChatLayout'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))
const BillingPage = lazy(() => import('./components/billing/BillingPage'))
const JoinRoomPage = lazy(() => import('./components/chat/JoinRoomPage'))

/*
 * ProtectedRoute — route wrapper that blocks unauthenticated access.
 * It reads the JWT access token from authStore. If no token is present
 * (user is not logged in), it sends them to /login and replaces the
 * history entry so pressing Back does not return to the protected page.
 */
function ProtectedRoute({ children }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.active === false) return <SuspendedPage />
  return children
}

/*
 * PublicRoute — route wrapper for pages that logged-in users should not see.
 * If a user already has a valid token (they're logged in), redirect them
 * straight to /chat so they do not see the login or register forms again.
 */
function PublicRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return !token ? children : <Navigate to="/chat" replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastContainer />
      <BroadcastBanner />
      <WebSocketKeepAlive />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>}>
          <Routes>
            <Route path="/" element={<PublicRoute><HomePage /></PublicRoute>} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
            <Route path="/verify-email" element={<PublicRoute><VerifyEmailPage /></PublicRoute>} />
            <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
            <Route path="/join/:code" element={<ProtectedRoute><JoinRoomPage /></ProtectedRoute>} />
            <Route path="/chat/*" element={<ProtectedRoute><ChatLayout /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}
