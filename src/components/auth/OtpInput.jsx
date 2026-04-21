/*
 * OtpInput.jsx — Accessible 6-Box OTP Entry Component
 *
 * Purpose:
 *   Renders a row of individual single-character input boxes for entering
 *   a numeric one-time password (OTP). Used on the email verification page,
 *   the login OTP section, and the forgot-password flow.
 *
 * Why individual boxes instead of one input field?
 *   Individual boxes give strong visual feedback: the user sees exactly which
 *   position they are on, filled boxes are highlighted, and the cursor advances
 *   automatically. This is the standard UX pattern for OTP entry on mobile and web.
 *
 * How the value flows:
 *   The component is controlled — it receives `value` (a string like "1234")
 *   and calls `onChange(newString)` when any digit changes. The parent stores
 *   the full string. Internally, `digits` is an array derived from the string
 *   (e.g., "12" → ['1','2','','','','']) for individual box rendering.
 *
 * Auto-advance on digit entry:
 *   When a digit is typed in box N, the cursor automatically moves to box N+1.
 *   This is done by calling refs.current[idx + 1]?.focus().
 *
 * Keyboard navigation:
 *   - Backspace on an empty box: moves focus to the previous box (intuitive delete flow).
 *   - ArrowLeft / ArrowRight: move focus between boxes without changing values.
 *
 * Paste handling:
 *   When the user pastes a code (e.g., from an SMS notification), the handlePaste
 *   function strips all non-digit characters, takes the first `length` digits,
 *   and fills all boxes at once. Focus is moved to the last box after paste.
 *   e.preventDefault() stops the browser from inserting raw pasted text into one box.
 *
 * Props:
 *   value     — the current OTP string (e.g., "1234" or "123456")
 *   onChange  — callback that receives the updated OTP string
 *   length    — number of boxes (default: 6 for standard OTPs)
 *   autoFocus — whether to focus the first box on mount (default: true)
 *   disabled  — disables all inputs (used while verifying to prevent re-entry)
 */
import { useRef, useEffect } from 'react'

export default function OtpInput({ value, onChange, length = 6, autoFocus = true, disabled = false }) {
  /*
   * digits — array of single-character strings, one per box.
   * Supports both a plain string value ("123456") and an array value (legacy).
   * Array.from({ length }) creates an array of `length` elements, then each
   * position picks the corresponding character from the string or falls back to ''.
   */
  const digits = Array.isArray(value) ? value : Array.from({ length }, (_, i) => value[i] || '')

  /*
   * refs — array of DOM refs, one per input box.
   * Used to programmatically move focus between boxes on keydown events.
   */
  const refs = useRef([])

  /* Auto-focus the first box when the component mounts */
  useEffect(() => {
    if (autoFocus && refs.current[0] && !disabled) refs.current[0].focus()
  }, [autoFocus, disabled])

  /*
   * update — handles a single digit being entered at position `idx`.
   * Only digits (0-9) are accepted; any other character is ignored.
   * The digit is stored at the correct position in a copy of the digits array,
   * then joined into a string and passed to onChange.
   * After entry, focus moves to the next box automatically.
   */
  const update = (idx, val) => {
    if (!/^\d*$/.test(val)) return
    const next = [...digits]
    next[idx] = val.slice(-1)
    onChange(next.join(''))
    if (val && idx < length - 1) refs.current[idx + 1]?.focus()
  }

  /*
   * handleKeyDown — keyboard navigation:
   * - Backspace on an empty box: instead of doing nothing, we move focus left
   *   so the user can delete the previous digit without pressing Backspace twice.
   * - ArrowLeft / ArrowRight: move focus without modifying values.
   */
  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) refs.current[idx - 1]?.focus()
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus()
    if (e.key === 'ArrowRight' && idx < length - 1) refs.current[idx + 1]?.focus()
  }

  /*
   * handlePaste — handles paste events on any box in the row.
   * Strips all non-digit characters from the pasted text, takes exactly
   * `length` digits, and calls onChange with the full code string.
   * Only fires if the pasted text fills all boxes (length === length check),
   * preventing partial pastes from partially filling the row.
   * Focus goes to the last box to signal the code is complete.
   */
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (text.length === length) {
      e.preventDefault()
      onChange(text)
      refs.current[length - 1]?.focus()
    }
  }

  return (
    <div className="otp-row" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          className={`otp-input ${digits[i] ? 'filled' : ''}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
