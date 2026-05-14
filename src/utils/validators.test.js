/*
 * validators.test.js — Unit Tests for Form Validation Utilities
 *
 * WHAT IS BEING TESTED:
 *   All functions exported from validators.js:
 *   - capitalizeFullName  — auto-capitalizes each word as the user types
 *   - normalizeUsername   — strips invalid chars and lowercases in real-time
 *   - normalizePhone      — strips non-digits and caps at 10 digits
 *   - validateFullName    — returns error string or null
 *   - validateUsername    — returns error string or null
 *   - validateEmail       — returns error string or null
 *   - validatePhone       — returns error string or null
 *   - passwordChecks      — returns { length, lower, upper, digit, symbol }
 *   - isPasswordValid     — returns true only if ALL 5 rules are met
 *   - passwordStrength    — returns { level, met, label }
 *   - maskEmail           — partial email masking for display
 *   - maskPhone           — partial phone masking for display
 *
 * WHY TEST PURE UTILITY FUNCTIONS?
 *   These functions have NO side effects and NO dependencies — they take a string
 *   in and return a value out. That makes them the easiest possible things to unit-
 *   test. Yet they are also critical: a broken email validator means spam accounts,
 *   a broken phone validator means SMS delivery failures, a broken password validator
 *   means weak passwords slip through.
 *
 * HOW TO READ THESE TESTS:
 *   Each test follows the AAA pattern:
 *     Arrange  — set up the input value
 *     Act      — call the function
 *     Assert   — check the result with expect()
 *
 *   "it('should ...', () => {})" is the same as "test('should ...', () => {})".
 *   "describe('groupName', () => {})" groups related tests so the output is organised.
 *
 * HOW TO RUN:
 *   npm run test:unit          → run all unit tests once
 *   npm run test:unit:watch    → re-run on save (great while writing code)
 */

import {
  capitalizeFullName,
  normalizeUsername,
  normalizePhone,
  validateFullName,
  validateUsername,
  validateEmail,
  validatePhone,
  passwordChecks,
  isPasswordValid,
  passwordStrength,
  maskEmail,
  maskPhone,
} from './validators.js'

// ══════════════��══════════════════════════════════════��══════════════════════
// capitalizeFullName
// ══════════════════════════════════════════════════════════════��═════════════

describe('capitalizeFullName', () => {
  it('capitalizes the first letter of each word', () => {
    expect(capitalizeFullName('john doe')).toBe('John Doe')
  })

  it('handles a single word', () => {
    expect(capitalizeFullName('alice')).toBe('Alice')
  })

  it('preserves already-capitalized input', () => {
    expect(capitalizeFullName('Jane Smith')).toBe('Jane Smith')
  })

  it('handles names with multiple spaces', () => {
    /*
     * The function splits by space and capitalizes each word.
     * A double-space produces an empty segment which is returned as-is.
     */
    const result = capitalizeFullName('mary  anne')
    expect(result).toContain('Mary')
    expect(result).toContain('Anne')
  })

  it('returns empty string for empty input', () => {
    expect(capitalizeFullName('')).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(capitalizeFullName(null)).toBe('')
    expect(capitalizeFullName(undefined)).toBe('')
  })
})

// ═══════════════════════════��═══════════════════════════���════════════════════
// normalizeUsername
// ═══════════════���════════════════════════════════════════════════════════════

describe('normalizeUsername', () => {
  it('lowercases the input', () => {
    expect(normalizeUsername('ALICE')).toBe('alice')
  })

  it('strips characters that are not lowercase letters, digits, or underscore', () => {
    /*
     * USERNAME_RE allows [a-z0-9_] only.
     * Spaces, hyphens, dots, and special chars are stripped.
     */
    expect(normalizeUsername('alice doe!')).toBe('alicedoe')
    expect(normalizeUsername('user-name')).toBe('username')
    expect(normalizeUsername('user.name')).toBe('username')
  })

  it('strips whitespace', () => {
    expect(normalizeUsername('  alice  ')).toBe('alice')
  })

  it('preserves underscores', () => {
    expect(normalizeUsername('alice_99')).toBe('alice_99')
  })

  it('truncates to 24 characters', () => {
    const long = 'a'.repeat(30)
    expect(normalizeUsername(long)).toBe('a'.repeat(24))
  })

  it('returns empty string for empty input', () => {
    expect(normalizeUsername('')).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizeUsername(null)).toBe('')
    expect(normalizeUsername(undefined)).toBe('')
  })
})

// ═══════════════════════════════���════════════════════════════════════════════
// normalizePhone
// ════════════════════════════════════════════════════════════════════════════

describe('normalizePhone', () => {
  it('strips non-digit characters', () => {
    /*
     * Users often paste phone numbers with spaces, dashes, or parentheses.
     * e.g., "+91 98765-43210" → "9876543210" (note: leading country code is stripped)
     */
    expect(normalizePhone('+91 98765-43210')).toBe('9198765432')
  })

  it('strips all dashes and spaces', () => {
    expect(normalizePhone('98765-43210')).toBe('9876543210')
  })

  it('keeps only digits', () => {
    expect(normalizePhone('(987) 654-3210')).toBe('9876543210')
  })

  it('truncates to 10 digits', () => {
    expect(normalizePhone('12345678901234')).toBe('1234567890')
  })

  it('returns fewer than 10 digits if input has fewer', () => {
    expect(normalizePhone('1234')).toBe('1234')
  })

  it('returns empty string for empty input', () => {
    expect(normalizePhone('')).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
  })
})

// ══════════════════════════════════════════════════════════════���═════════════
// validateFullName
// ══════════════════════════════════════════════════���════════════════════════��

describe('validateFullName', () => {
  it('returns null for a valid full name', () => {
    /*
     * null means "no error" — the input is valid.
     * This is the convention used by all validate*() functions.
     */
    expect(validateFullName('Alice Smith')).toBeNull()
  })

  it('returns null for a name with a dot', () => {
    expect(validateFullName('Dr. Who')).toBeNull()
  })

  it('returns null for a name with an apostrophe', () => {
    expect(validateFullName("O'Brien")).toBeNull()
  })

  it('returns null for a name with a hyphen', () => {
    expect(validateFullName('Mary-Jane Watson')).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validateFullName('')).toBe('Full name is required')
  })

  it('returns error for whitespace-only string', () => {
    expect(validateFullName('   ')).toBe('Full name is required')
  })

  it('returns error for null', () => {
    expect(validateFullName(null)).toBe('Full name is required')
  })

  it('returns error for a single character', () => {
    /*
     * Minimum length is 2 characters to prevent "A" being a valid name.
     */
    expect(validateFullName('A')).toBe('Full name is too short')
  })

  it('returns error when the first letter is lowercase', () => {
    /*
     * The FULL_NAME_RE requires /^[A-Z]/ — first char must be uppercase.
     */
    expect(validateFullName('alice smith')).toBe('Must start with a capital letter')
  })

  it('returns error for names with digits', () => {
    /*
     * Names cannot contain numbers — "Alice99" would fail FULL_NAME_RE.
     */
    expect(validateFullName('Alice99')).toBeTruthy() // any non-null error
  })
})

// ════════════════════════════════════════════════════════════════════════════
// validateUsername
// ══════════════════════════════════════════════════════════════════════��═════

describe('validateUsername', () => {
  it('returns null for a valid username', () => {
    expect(validateUsername('alice_99')).toBeNull()
    expect(validateUsername('abc')).toBeNull()       // minimum 3 chars
    expect(validateUsername('a'.repeat(24))).toBeNull() // maximum 24 chars
  })

  it('returns error for empty / null', () => {
    expect(validateUsername('')).toBe('Username is required')
    expect(validateUsername(null)).toBe('Username is required')
  })

  it('returns error for fewer than 3 characters', () => {
    expect(validateUsername('ab')).toBe('Must be at least 3 characters')
  })

  it('returns error for more than 24 characters', () => {
    expect(validateUsername('a'.repeat(25))).toBe('Must be at most 24 characters')
  })

  it('returns error for uppercase letters', () => {
    /*
     * Usernames must be all lowercase. normalizeUsername() enforces this on-type,
     * but validateUsername() is the final check before form submission.
     */
    expect(validateUsername('Alice')).toBe('Only lowercase letters, digits, and underscores')
  })

  it('returns error for special characters', () => {
    expect(validateUsername('user-name')).toBe('Only lowercase letters, digits, and underscores')
    expect(validateUsername('user name')).toBe('Only lowercase letters, digits, and underscores')
  })

  it('returns null for username with digits', () => {
    expect(validateUsername('user123')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// validateEmail
// ════════════════════════════════════��═══════════════════════════════════════

describe('validateEmail', () => {
  it('returns null for valid emails', () => {
    expect(validateEmail('user@example.com')).toBeNull()
    expect(validateEmail('a+tag@sub.domain.org')).toBeNull()
    expect(validateEmail('test.name@company.co.uk')).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validateEmail('')).toBe('Email is required')
  })

  it('returns error for null', () => {
    expect(validateEmail(null)).toBe('Email is required')
  })

  it('returns error for missing @ symbol', () => {
    expect(validateEmail('notanemail')).toBe('Enter a valid email address')
  })

  it('returns error for missing domain', () => {
    expect(validateEmail('user@')).toBe('Enter a valid email address')
  })

  it('returns error for missing TLD', () => {
    /*
     * EMAIL_RE requires the domain part to have at least 2 characters after the dot.
     * "user@example.c" would fail because "c" is only 1 character.
     */
    expect(validateEmail('user@example.c')).toBe('Enter a valid email address')
  })

  it('returns error for spaces', () => {
    expect(validateEmail('user @example.com')).toBe('Enter a valid email address')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// validatePhone
// ═══════════════════════════════════════════════════════════════════���════════

describe('validatePhone', () => {
  it('returns null for valid Indian mobile numbers', () => {
    /*
     * Valid Indian mobiles start with 6, 7, 8, or 9 and are exactly 10 digits.
     */
    expect(validatePhone('9876543210')).toBeNull()
    expect(validatePhone('8765432109')).toBeNull()
    expect(validatePhone('7654321098')).toBeNull()
    expect(validatePhone('6543210987')).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validatePhone('')).toBe('Phone number is required')
  })

  it('returns error for null', () => {
    expect(validatePhone(null)).toBe('Phone number is required')
  })

  it('returns error for numbers starting with 5', () => {
    /*
     * Indian mobile numbers starting with 5 are not valid for consumer use.
     * INDIAN_PHONE_RE = /^[6-9]\d{9}$/
     */
    expect(validatePhone('5123456789')).toBe('Enter a valid 10-digit Indian mobile number')
  })

  it('returns error for numbers starting with 1', () => {
    expect(validatePhone('1234567890')).toBe('Enter a valid 10-digit Indian mobile number')
  })

  it('returns error for fewer than 10 digits', () => {
    expect(validatePhone('987654321')).toBe('Enter a valid 10-digit Indian mobile number')
  })

  it('returns error for more than 10 digits', () => {
    expect(validatePhone('98765432101')).toBe('Enter a valid 10-digit Indian mobile number')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// passwordChecks
// ══════════════════════════════════════════════════════════════════��═════════

describe('passwordChecks', () => {
  it('returns all false for an empty password', () => {
    const checks = passwordChecks('')
    /*
     * All 5 rules fail for an empty string:
     * length (< 8), lower (no lowercase), upper (no uppercase), digit, symbol.
     */
    expect(checks.length).toBe(false)
    expect(checks.lower).toBe(false)
    expect(checks.upper).toBe(false)
    expect(checks.digit).toBe(false)
    expect(checks.symbol).toBe(false)
  })

  it('returns all true for a fully valid password', () => {
    const checks = passwordChecks('Secure@123')
    expect(checks.length).toBe(true)  // 10 chars >= 8
    expect(checks.lower).toBe(true)   // 'ecure' — lowercase present
    expect(checks.upper).toBe(true)   // 'S' — uppercase present
    expect(checks.digit).toBe(true)   // '123' — digit present
    expect(checks.symbol).toBe(true)  // '@' — symbol present
  })

  it('detects length >= 8', () => {
    expect(passwordChecks('abcdefgh').length).toBe(true)   // exactly 8
    expect(passwordChecks('abcdefg').length).toBe(false)   // only 7
  })

  it('detects lowercase letters', () => {
    expect(passwordChecks('abc').lower).toBe(true)
    expect(passwordChecks('ABC').lower).toBe(false)
  })

  it('detects uppercase letters', () => {
    expect(passwordChecks('ABC').upper).toBe(true)
    expect(passwordChecks('abc').upper).toBe(false)
  })

  it('detects digits', () => {
    expect(passwordChecks('abc123').digit).toBe(true)
    expect(passwordChecks('abcDEF').digit).toBe(false)
  })

  it('detects symbols from the allowed set', () => {
    /*
     * PASSWORD_SYMBOL = /[@$!%*?&#^()\-_+=~`[\]{}|;:'",.<>/?\\]/
     * Tests a selection of valid symbols.
     */
    expect(passwordChecks('pass@word').symbol).toBe(true)
    expect(passwordChecks('pass!word').symbol).toBe(true)
    expect(passwordChecks('pass#word').symbol).toBe(true)
    expect(passwordChecks('passWord1').symbol).toBe(false)  // no symbol
  })

  it('handles null/undefined gracefully', () => {
    const checks = passwordChecks(null)
    expect(checks.length).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════��═══════
// isPasswordValid
// ════════════════════════════════════════════════════════════════════════════

describe('isPasswordValid', () => {
  it('returns true only when ALL 5 rules are satisfied', () => {
    expect(isPasswordValid('Secure@123')).toBe(true)
  })

  it('returns false when one rule is missing — no symbol', () => {
    expect(isPasswordValid('SecurePass1')).toBe(false)
  })

  it('returns false when one rule is missing — no digit', () => {
    expect(isPasswordValid('Secure@Pass')).toBe(false)
  })

  it('returns false when one rule is missing — no uppercase', () => {
    expect(isPasswordValid('secure@123')).toBe(false)
  })

  it('returns false when one rule is missing — no lowercase', () => {
    expect(isPasswordValid('SECURE@123')).toBe(false)
  })

  it('returns false when one rule is missing — too short', () => {
    expect(isPasswordValid('Se@1')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isPasswordValid('')).toBe(false)
  })
})

// ════════════════════════════════════════════���═══════════════════════════════
// passwordStrength
// ════════════════════════════════════════════════════════════════════════════

describe('passwordStrength', () => {
  /*
   * passwordStrength counts how many of the 5 rules are met and maps to a level:
   *   0-1 → weak   / "Too weak"
   *   2   → fair   / "Fair"
   *   3   → good   / "Good"
   *   4   → strong / "Strong"
   *   5   → excellent / "Excellent"
   */

  it('returns "weak" for an empty password (0 rules met)', () => {
    const result = passwordStrength('')
    expect(result.level).toBe('weak')
    expect(result.label).toBe('Too weak')
    expect(result.met).toBe(0)
  })

  it('returns "weak" for a password meeting only 1 rule', () => {
    /*
     * 'a' — only the lowercase rule is met (length<8, no upper, no digit, no symbol)
     */
    const result = passwordStrength('a')
    expect(result.level).toBe('weak')
    expect(result.met).toBe(1)
  })

  it('returns "fair" for a password meeting 2 rules', () => {
    /*
     * 'abcdefgh' — meets length (8) and lowercase. No upper, digit, or symbol.
     */
    const result = passwordStrength('abcdefgh')
    expect(result.level).toBe('fair')
    expect(result.label).toBe('Fair')
    expect(result.met).toBe(2)
  })

  it('returns "good" for a password meeting 3 rules', () => {
    /*
     * 'Abcdefgh' — meets length, lowercase, uppercase. No digit, no symbol.
     */
    const result = passwordStrength('Abcdefgh')
    expect(result.level).toBe('good')
    expect(result.label).toBe('Good')
    expect(result.met).toBe(3)
  })

  it('returns "strong" for a password meeting 4 rules', () => {
    /*
     * 'Abcdefg1' — meets length, lower, upper, digit. No symbol.
     */
    const result = passwordStrength('Abcdefg1')
    expect(result.level).toBe('strong')
    expect(result.label).toBe('Strong')
    expect(result.met).toBe(4)
  })

  it('returns "excellent" for a fully valid password (5 rules met)', () => {
    const result = passwordStrength('Secure@123')
    expect(result.level).toBe('excellent')
    expect(result.label).toBe('Excellent')
    expect(result.met).toBe(5)
  })
})

// ════════════════════════════════════════════════���═══════════════════════════
// maskEmail
// ═══════════════════════════════════════��════════════════════════════════���═══

describe('maskEmail', () => {
  it('shows only the first two characters of the local part', () => {
    /*
     * "john.doe@gmail.com" → "jo***@gmail.com"
     * This confirms the user recognizes the account without fully exposing it.
     */
    const result = maskEmail('john.doe@gmail.com')
    expect(result.startsWith('jo')).toBe(true)
    expect(result).toContain('***@gmail.com')
  })

  it('preserves the full domain part', () => {
    const result = maskEmail('alice@company.co.uk')
    expect(result).toContain('@company.co.uk')
  })

  it('returns the original value for input without @', () => {
    /*
     * If the input is not a valid email format (no @), return it unchanged
     * rather than throwing or producing garbage output.
     */
    expect(maskEmail('notanemail')).toBe('notanemail')
  })

  it('returns empty string for null/undefined', () => {
    expect(maskEmail(null)).toBe('')
    expect(maskEmail(undefined)).toBe('')
  })

  it('handles short local part (single char)', () => {
    /*
     * "a@b.com" — local part is just "a", shorter than 2 chars.
     * The function should not crash when slicing a 1-char string.
     */
    const result = maskEmail('a@b.com')
    expect(typeof result).toBe('string')
  })
})

// ══════════════════════════════════════════════���═════════════════════════════
// maskPhone
// ═══════════════════════════════════════════════════════════════════��════════

describe('maskPhone', () => {
  it('shows only the last 4 digits', () => {
    /*
     * "9876543210" → "••••••3210"
     * The user can confirm it's their number without the full number being visible.
     */
    const result = maskPhone('9876543210')
    expect(result).toBe('••••••3210')
  })

  it('strips non-digits before masking', () => {
    /*
     * Some callers may pass the raw number with spaces or dashes.
     */
    const result = maskPhone('987-654-3210')
    expect(result.endsWith('3210')).toBe(true)
  })

  it('returns empty string for null/undefined', () => {
    expect(maskPhone(null)).toBe('')
    expect(maskPhone(undefined)).toBe('')
  })

  it('returns the raw digits if fewer than 4', () => {
    /*
     * A 3-digit input has no meaningful masking — return it as-is.
     */
    const result = maskPhone('123')
    expect(result).toBe('123')
  })

  it('handles numeric input (not just strings)', () => {
    /*
     * The function calls String(p) to handle numbers — test that it works.
     */
    const result = maskPhone(9876543210)
    expect(result.endsWith('3210')).toBe(true)
  })
})
