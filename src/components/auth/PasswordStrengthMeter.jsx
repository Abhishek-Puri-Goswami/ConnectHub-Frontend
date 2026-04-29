/*
 * PasswordStrengthMeter.jsx — Live Password Strength Indicator
 *
 * Purpose:
 *   Shown below the password input on the Register and ForgotPassword pages.
 *   Gives the user immediate visual feedback on how strong their password is
 *   as they type, so they know what changes to make before they submit.
 *
 * What it shows:
 *   1. A colored progress bar that fills from left to right based on how many
 *      of the 5 password requirements are met.
 *   2. A text label (e.g., "Weak", "Good", "Strong", "Very Strong") that
 *      also changes color to match the bar.
 *   3. A checklist of the five individual requirements, each showing a green
 *      check or red X based on whether the requirement is currently satisfied.
 *
 * How strength is calculated:
 *   passwordChecks(password) from validators.js returns a { length, lower,
 *   upper, digit, symbol } object where each field is true if that requirement
 *   is satisfied. passwordStrength(password) counts how many are true and
 *   maps the count to a label and CSS level class (e.g., "weak", "good",
 *   "strong", "very-strong", "perfect").
 *
 * How the bar fills:
 *   The CSS width is set to `(met / 5) * 100%` where `met` is the number of
 *   satisfied requirements. So passing 3 out of 5 rules → 60% width.
 *   The bar's color is controlled by the `level` CSS class on the fill element.
 *
 * Props:
 *   password — the current password string from the form input
 */
import { Check, X } from 'lucide-react'
import { passwordChecks, passwordStrength } from '../../utils/validators'

export default function PasswordStrengthMeter({ password }) {
  /*
   * c — individual boolean flags for each of the five password rules:
   *   length (8+ chars), lower, upper, digit, symbol
   */
  const c = passwordChecks(password)

  /*
   * s — overall strength summary: { met: number, label: string, level: string }
   *   met   — how many of the 5 checks passed (0-5)
   *   label — human-readable label ("Too short", "Weak", "Good", etc.)
   *   level — CSS class name applied to the bar fill for color coding
   */
  const s = passwordStrength(password)

  /*
   * reqs — the requirement checklist displayed below the strength bar.
   * Each entry maps a rule's boolean flag to a label shown to the user.
   */
  const reqs = [
    { label: '8+ characters', met: c.length },
    { label: 'Lowercase',     met: c.lower  },
    { label: 'Uppercase',     met: c.upper  },
    { label: 'Digit',         met: c.digit  },
    { label: 'Symbol',        met: c.symbol },
  ]

  return (
    <div className="pw-meter pw-strength">
      {/* Progress bar — width reflects the fraction of rules passed */}
      <div className="pw-strength-track">
        <div
          className={`pw-strength-fill ${s.level}`}
          style={{ width: `${(s.met / 5) * 100}%` }}
        />
      </div>

      {/* Strength label row — "Password strength" on left, level name on right */}
      <div className="pw-strength-label">
        <span>Password strength</span>
        <span style={{ color: 'var(--text)' }}>{s.label}</span>
      </div>

      {/* Requirement checklist — each item shows a ✓ or ✗ icon */}
      <div className="pw-reqs">
        {reqs.map(r => (
          <span key={r.label} className={`pw-req ${r.met ? 'met' : ''}`}>
            <span className="pw-req-dot">{r.met ? <Check size={10} /> : <X size={10} />}</span>
            {r.label}
          </span>
        ))}
      </div>
    </div>
  )
}
