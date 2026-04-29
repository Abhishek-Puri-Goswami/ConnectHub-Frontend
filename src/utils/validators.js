/*
 * validators.js — Shared Form Validation Rules and Utilities
 *
 * Purpose:
 *   Centralizes all validation logic used by auth forms (register, login, forgot-password).
 *   By keeping rules here, every form enforces the same constraints and error messages
 *   consistently — a username has the same rules on the registration form and the
 *   profile edit form.
 *
 * What is exported:
 *   1. Regex constants — used by both the validate functions and the PasswordStrengthMeter.
 *   2. Normalize functions — clean user input on-the-fly as they type (e.g., strip
 *      invalid characters from usernames before the user even submits).
 *   3. Validate functions — return a string error message or null if valid.
 *   4. Password helpers — passwordChecks(), isPasswordValid(), passwordStrength() —
 *      used by PasswordStrengthMeter to show a live strength indicator.
 *   5. Mask helpers — maskEmail(), maskPhone() — show partial values (e.g., "j•••@gmail.com")
 *      in confirmation screens for security without fully hiding the info.
 */

/*
 * Regular expression constants:
 *   FULL_NAME_RE  — must start with uppercase, allows letters/spaces/apostrophes/dots/hyphens, max 60 chars
 *   USERNAME_RE   — only lowercase letters, digits, underscores; 3-24 chars
 *   EMAIL_RE      — basic email format check (not fully RFC-compliant but catches common mistakes)
 *   INDIAN_PHONE_RE — 10-digit Indian mobile: must start with 6, 7, 8, or 9
 *   PASSWORD_*    — individual character-class checks used for strength scoring
 */
export const FULL_NAME_RE = /^[A-Z][a-zA-Z\s'.-]{0,59}$/
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const INDIAN_PHONE_RE = /^[6-9]\d{9}$/
export const PASSWORD_LOWER = /[a-z]/
export const PASSWORD_UPPER = /[A-Z]/
export const PASSWORD_DIGIT = /\d/
export const PASSWORD_SYMBOL = /[@$!%*?&#^()\-_+=~`[\]{}|;:'",.<>/?\\]/

/*
 * capitalizeFullName(s) — ensures the first letter of the name is uppercase.
 * Called on every keystroke in the Full Name field so the user sees the correction
 * immediately without an error message.
 */
export const capitalizeFullName = (s) => {
  if (!s) return ''
  return s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}

/*
 * normalizeUsername(s) — forces the username to be lowercase and strips any
 * characters that are not letters, digits, or underscores. Also enforces the
 * 24-character maximum. Called on every keystroke so the user cannot even type
 * an invalid character — it just silently disappears.
 */
export const normalizeUsername = (s) => {
  if (!s) return ''
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
}

/*
 * normalizePhone(s) — strips all non-digit characters and caps at 10 digits.
 * Allows users to paste numbers with spaces, dashes, or parentheses (e.g., "+91 98765-43210")
 * and the form will automatically clean it to "9876543210".
 */
export const normalizePhone = (s) => {
  if (!s) return ''
  return s.replace(/\D/g, '').slice(0, 10)
}

/*
 * validateFullName(s) — returns an error string or null.
 * Rules: required, minimum 2 chars, must start with capital letter, only allowed characters.
 */
export const validateFullName = (s) => {
  if (!s?.trim()) return 'Full name is required'
  if (s.length < 2) return 'Full name is too short'
  if (!/^[A-Z]/.test(s)) return 'Must start with a capital letter'
  if (!/^[A-Z][a-zA-Z\s'.-]{0,59}$/.test(s)) return 'Only letters, spaces, . or - allowed'
  return null
}

/*
 * validateUsername(s) — returns an error string or null.
 * Rules: required, 3-24 chars, only lowercase + digits + underscore.
 */
export const validateUsername = (s) => {
  if (!s) return 'Username is required'
  if (s.length < 3) return 'Must be at least 3 characters'
  if (s.length > 24) return 'Must be at most 24 characters'
  if (!USERNAME_RE.test(s)) return 'Only lowercase letters, digits, and underscores'
  return null
}

/*
 * validateEmail(s) — returns an error string or null.
 * Uses EMAIL_RE for a basic format check. Does not verify if the email actually exists.
 */
export const validateEmail = (s) => {
  if (!s) return 'Email is required'
  if (!EMAIL_RE.test(s)) return 'Enter a valid email address'
  return null
}

/*
 * validatePhone(s) — returns an error string or null.
 * Validates 10-digit Indian mobile numbers (starts with 6, 7, 8, or 9).
 */
export const validatePhone = (s) => {
  if (!s) return 'Phone number is required'
  if (!INDIAN_PHONE_RE.test(s)) return 'Enter a valid 10-digit Indian mobile number'
  return null
}

/*
 * passwordChecks(p) — returns an object with a boolean for each password rule.
 * { length, lower, upper, digit, symbol } — each true if the password meets that rule.
 * Used by PasswordStrengthMeter to render individual requirement checkmarks.
 */
export const passwordChecks = (p) => ({
  length: (p || '').length >= 8,
  lower: PASSWORD_LOWER.test(p || ''),
  upper: PASSWORD_UPPER.test(p || ''),
  digit: PASSWORD_DIGIT.test(p || ''),
  symbol: PASSWORD_SYMBOL.test(p || ''),
})

/*
 * isPasswordValid(p) — returns true only if ALL five password rules are met.
 * Used as the final gate before allowing form submission.
 */
export const isPasswordValid = (p) => {
  const c = passwordChecks(p)
  return c.length && c.lower && c.upper && c.digit && c.symbol
}

/*
 * passwordStrength(p) — returns a strength assessment object.
 * Counts how many of the 5 rules are met and maps that to a named level:
 *   1 rule met  → "Too weak"
 *   2 rules met → "Fair"
 *   3 rules met → "Good"
 *   4 rules met → "Strong"
 *   5 rules met → "Excellent"
 * Used by PasswordStrengthMeter to render the colored progress bar.
 */
export const passwordStrength = (p) => {
  const c = passwordChecks(p)
  const met = Object.values(c).filter(Boolean).length
  if (met <= 1) return { level: 'weak', met, label: 'Too weak' }
  if (met <= 2) return { level: 'fair', met, label: 'Fair' }
  if (met <= 3) return { level: 'good', met, label: 'Good' }
  if (met === 4) return { level: 'strong', met, label: 'Strong' }
  return { level: 'excellent', met, label: 'Excellent' }
}

/*
 * maskEmail(e) — returns a partially hidden email for display on confirmation screens.
 * Example: "john.doe@gmail.com" → "j•••@gmail.com"
 * Shows enough to confirm the user recognizes the account without fully exposing it.
 */
export const maskEmail = (e) => {
  if (!e || !e.includes('@')) return e || ''
  const [name, domain] = e.split('@')
  if (!name) return e
  return name.slice(0, 2) + '***@' + domain
}

/*
 * maskPhone(p) — returns a partially hidden phone number for display.
 * Example: "9876543210" → "••••••3210"
 * Shows only the last 4 digits so the user can confirm it's their number.
 */
export const maskPhone = (p) => {
  if (!p) return ''
  const s = String(p).replace(/\D/g, '')
  if (s.length < 4) return s
  return '••••••' + s.slice(-4)
}
