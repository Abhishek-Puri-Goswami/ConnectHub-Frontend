import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Video, Shield, Zap, Globe, Sparkles, ChevronRight, Users, User, Hash, TrendingUp } from 'lucide-react';
import ThemeToggle from '../../theme/ThemeToggle';
import './HomePage.css';

/* ─── Count-Up Animation Hook ───────────────────────────────────────────── */
function useCountUp(target, duration = 1800, started = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!started || target === 0) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // easeOutExpo for satisfying deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, started]);
  return count;
}

/* ─── Stat Card Component ────────────────────────────────────────────────── */
function StatCard({ icon: Icon, color, label, value, suffix = '', prefix = '', loading }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const animated = useCountUp(value, 1600, visible && !loading);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const display = loading
    ? '—'
    : `${prefix}${animated.toLocaleString()}${suffix}`;

  return (
    <div className="stat-card clay" ref={ref}>
      <div className="stat-card-icon clay-inset" style={{ '--stat-color': color }}>
        <Icon size={22} color={color} />
      </div>
      <div className="stat-card-body">
        <div className="stat-card-value" style={{ color }}>
          {loading ? <span className="skeleton stat-skeleton" /> : display}
        </div>
        <div className="stat-card-label">{label}</div>
      </div>
      <div className="stat-card-bar">
        <div className="stat-card-bar-fill" style={{ '--bar-color': color, width: loading ? '0%' : '100%' }} />
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */
export default function HomePage() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/auth/public/stats')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setStats(data); setStatsLoading(false); })
      .catch(() => {
        // Fallback — backend not reachable (local dev without backend)
        setStats({ totalUsers: 0, onlineUsers: 0, activeRooms: 0, messagesToday: 0 });
        setStatsLoading(false);
      });
  }, []);

  return (
    <div className="home-container">
      {/* ─── HEADER ─── */}
      <header className="home-header fade-in">
        <div className="logo-container">
          <div className="logo-icon clay">
            <MessageSquare size={20} className="spin-slow" />
          </div>
          <span className="logo-text">ConnectHub</span>
        </div>
        <nav className="header-nav">
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost">Log In</Link>
          <Link to="/register" className="btn btn-primary">Sign Up <ChevronRight size={16} /></Link>
        </nav>
      </header>

      {/* ─── HERO SECTION ─── */}
      <section className="hero-section">
        <div className="floating-shape shape-1 clay float" />
        <div className="floating-shape shape-2 clay-inset float" style={{ animationDelay: '1s' }} />
        <div className="floating-shape shape-3 clay float" style={{ animationDelay: '2s' }} />

        <div className="hero-content fade-in">
          <div className="badge clay-inset"><Sparkles size={14} /> The Future of Collaboration</div>
          <h1 className="hero-title">
            Connect, Collaborate, <br />
            <span className="text-gradient">Create.</span>
          </h1>
          <p className="hero-subtitle">
            Experience a new wave of seamless communication. ConnectHub brings your team,
            friends, and ideas together in a beautifully crafted, real-time environment.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-lg scale-in">Get Started for Free</Link>
            <Link to="/login" className="btn btn-soft btn-lg scale-in" style={{ animationDelay: '0.1s' }}>Login to Workspace</Link>
          </div>
        </div>

        {/* Mockup */}
        <div className="hero-visual fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="mockup-window clay-lg">
            <div className="mockup-header">
              <div className="dot red" /><div className="dot yellow" /><div className="dot green" />
              <span className="mockup-title"># general</span>
            </div>
            <div className="mockup-body">
              <div className="mock-sidebar clay-inset">
                <div className="mock-sidebar-item active clay">
                  <Hash size={12} /> <span>general</span>
                </div>
                <div className="mock-sidebar-item">
                  <Hash size={12} /> <span>design</span>
                </div>
                <div className="mock-sidebar-item">
                  <Hash size={12} /> <span>backend</span>
                </div>
                <div className="mock-sidebar-item">
                  <Hash size={12} /> <span>random</span>
                </div>
              </div>
              <div className="mock-chat">
                <div className="mock-message other">
                  <div className="mock-avatar clay-inset"><User size={12} color="var(--primary)" /></div>
                  <div className="mock-bubble clay">Hey team! Are we ready for the 10 AM launch? 🚀</div>
                </div>
                <div className="mock-message own">
                  <div className="mock-bubble clay" style={{ background: 'var(--bubble-own-bg)', color: 'var(--bubble-own-text)' }}>
                    Yes! All systems are green and the deployment is live. ✨
                  </div>
                </div>
                <div className="mock-message other">
                  <div className="mock-avatar clay-inset"><User size={12} color="var(--secondary)" /></div>
                  <div className="mock-bubble clay">Awesome work everyone. Let's monitor the metrics! 📈</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── LIVE STATS ─── */}
      <section className="stats-section">
        <div className="section-label">
          <TrendingUp size={16} color="var(--primary)" />
          <span>Live Platform Metrics</span>
        </div>
        <div className="stats-grid">
          <StatCard icon={Users}        color="var(--primary)"   label="Registered Users"  value={stats?.totalUsers   ?? 0} loading={statsLoading} />
          <StatCard icon={User}         color="var(--secondary)" label="Online Right Now"   value={stats?.onlineUsers  ?? 0} loading={statsLoading} />
          <StatCard icon={Hash}         color="var(--accent)"    label="Active Rooms"       value={stats?.activeRooms  ?? 0} loading={statsLoading} />
          <StatCard icon={MessageSquare} color="var(--warning)"  label="Messages Today"     value={stats?.messagesToday ?? 0} loading={statsLoading} />
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="features-section fade-in">
        <div className="section-header">
          <h2>Everything you need, beautifully designed.</h2>
          <p>Powered by our signature Claymorphism design system for a stunning user experience.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card clay">
            <div className="feature-icon-wrapper clay-inset"><Zap size={24} color="var(--primary)" /></div>
            <h3>Real-time Speed</h3>
            <p>Lightning-fast WebSocket connections ensure your messages are delivered instantly.</p>
          </div>
          <div className="feature-card clay">
            <div className="feature-icon-wrapper clay-inset"><Video size={24} color="var(--secondary)" /></div>
            <h3>Rich Media Sharing</h3>
            <p>Share files, images, and videos seamlessly with our integrated media services.</p>
          </div>
          <div className="feature-card clay">
            <div className="feature-icon-wrapper clay-inset"><Shield size={24} color="var(--danger)" /></div>
            <h3>Secure &amp; Private</h3>
            <p>End-to-end JWT authentication and robust role-based access control keep your data safe.</p>
          </div>
          <div className="feature-card clay">
            <div className="feature-icon-wrapper clay-inset"><Globe size={24} color="var(--accent)" /></div>
            <h3>Cross-Platform</h3>
            <p>Access your workspaces from anywhere. Fully responsive and beautifully adapted for all devices.</p>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="home-footer">
        <div className="footer-content">
          <div className="footer-left">
            <span className="footer-brand">ConnectHub</span>
            <span className="footer-copyright">© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="footer-right">
            <span>Developed by</span>
            <a href="https://github.com/Abhishek-Puri-Goswami" target="_blank" rel="noopener noreferrer" className="developer-link">
              Abhishek Puri Goswami
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
