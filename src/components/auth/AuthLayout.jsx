/*
 * AuthLayout.jsx — Shared Visual Shell for All Authentication Pages
 *
 * Purpose:
 *   Every auth page (Login, Register, VerifyEmail, ForgotPassword, OAuth2Callback)
 *   is wrapped in this component so they all share the same visual structure:
 *   a decorative animated background, a centered card, a brand header, and a
 *   row of feature highlights at the bottom. This avoids duplicating layout
 *   markup in each auth page.
 *
 * Structure (top to bottom):
 *   1. FloatingIcons — decorative background layer with floating claymorphism
 *      icon blobs. These are purely visual and are hidden from screen readers
 *      via aria-hidden.
 *   2. ThemeToggle — positioned in the top-right corner so the user can switch
 *      light/dark mode from any auth page without needing to be logged in.
 *   3. Auth brand header — the ConnectHub logo badge, app name, and tagline.
 *      The tagline is customized per page (e.g., "Welcome back" on login vs
 *      "Create your account" on register).
 *   4. Auth card — a claymorphism card (clay-lg class) with a scale-in animation.
 *      The `children` prop (the actual form content) is rendered here.
 *   5. Feature chips — three small badges at the bottom reminding users of
 *      key app features: Instant chat, Secure, Group rooms.
 *
 * FloatingIcons component:
 *   Renders 8 Lucide icons as absolutely positioned elements behind the card.
 *   Each icon has a custom position (top/left/right/bottom %), color (CSS variable),
 *   size, and animation delay so they float in and out of view in a staggered pattern.
 *   Three gradient blobs (auth-blob-1/2/3) add depth to the background.
 *
 * Props:
 *   children  — the form or content to show inside the auth card
 *   title     — the app name shown in the brand header (default: 'ConnectHub')
 *   tagline   — the subtitle shown below the app name (customized per page)
 */
import { MessageCircle, Heart, Sparkles, Shield, Zap, Users, Phone, Globe } from 'lucide-react'
import ThemeToggle from '../../theme/ThemeToggle'
import './AuthStyles.css'

/*
 * FloatingIcons — decorative background layer.
 * Each icon is absolutely positioned using CSS variables for color and inline
 * styles for position. animationDelay staggers the float animation so the icons
 * don't all move in sync, creating a lively parallax-like background effect.
 */
function FloatingIcons() {
  const icons = [
    { Icon: MessageCircle, style: { top: '8%',  left: '6%',  color: 'var(--primary)',   size: 64, delay: '0s'   } },
    { Icon: Heart,         style: { top: '14%', right: '8%', color: 'var(--danger)',    size: 56, delay: '1.2s' } },
    { Icon: Sparkles,      style: { top: '40%', left: '4%',  color: 'var(--accent)',    size: 60, delay: '2.4s' } },
    { Icon: Zap,           style: { top: '48%', right: '6%', color: 'var(--warning)',   size: 52, delay: '0.6s' } },
    { Icon: Users,         style: { bottom: '12%',left: '10%',color: 'var(--secondary)',size: 64, delay: '1.8s' } },
    { Icon: Shield,        style: { bottom: '10%',right: '12%',color: 'var(--accent)',  size: 58, delay: '3s'   } },
    { Icon: Phone,         style: { top: '28%', left: '48%', color: 'var(--primary)',   size: 48, delay: '0.9s' } },
    { Icon: Globe,         style: { bottom: '30%',left: '46%',color: 'var(--secondary)',size: 54, delay: '2.1s' } },
  ]
  return (
    <div className="auth-float-layer" aria-hidden>
      {icons.map(({ Icon, style }, i) => {
        const { size, delay, color, ...pos } = style
        return (
          <span key={i} className="auth-float-icon" style={{ ...pos, color, animationDelay: delay }}>
            <Icon size={size} strokeWidth={1.7} />
          </span>
        )
      })}
      {/* Soft gradient blobs that add depth behind the floating icons */}
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-blob auth-blob-3" />
    </div>
  )
}

export default function AuthLayout({ children, title = 'ConnectHub', tagline = 'Connect with anyone, anywhere' }) {
  return (
    <div className="auth-page">
      {/* Animated decorative background — aria-hidden so screen readers ignore it */}
      <FloatingIcons />

      {/* Theme toggle anchored to the top-right corner of the page */}
      <div className="auth-theme-corner">
        <ThemeToggle />
      </div>

      <div className="auth-wrapper">
        {/* Brand section: logo badge + app name + per-page tagline */}
        <div className="auth-brand">
          <div className="auth-logo-badge">
            <MessageCircle size={34} strokeWidth={2.2} />
          </div>
          <h1 className="auth-brand-title">{title}</h1>
          <p className="auth-brand-tagline">{tagline}</p>
        </div>

        {/* Auth card: claymorphism container that holds the children (form content) */}
        <div className="auth-card clay-lg scale-in">
          {children}
        </div>

        {/* Feature chips: three compact highlights shown below the card */}
        <div className="auth-feature-row">
          <div className="auth-feature-chip">
            <div className="auth-feature-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              <Zap size={16} />
            </div>
            <span>Instant chat</span>
          </div>
          <div className="auth-feature-chip">
            <div className="auth-feature-icon" style={{ background: 'var(--secondary-soft)', color: 'var(--secondary)' }}>
              <Shield size={16} />
            </div>
            <span>Secure</span>
          </div>
          <div className="auth-feature-chip">
            <div className="auth-feature-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Users size={16} />
            </div>
            <span>Group rooms</span>
          </div>
        </div>
      </div>
    </div>
  )
}
