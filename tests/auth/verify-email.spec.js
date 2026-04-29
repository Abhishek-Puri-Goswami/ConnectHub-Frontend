import { test, expect } from '@playwright/test'
import { mockVerifyOtp, mockResendOtp, mockChatApis } from '../helpers/api-mocks.js'

/**
 * Navigate to /verify-email with email state pre-seeded via sessionStorage.
 * React Router reads `location.state`, but Playwright can't set that directly —
 * so we navigate to /login first, intercept register, and follow the redirect,
 * OR we use page.evaluate to push history state with the email value.
 */
async function gotoVerifyEmail(page, email = 'jane@example.com') {
  await page.goto('/login')
  // React Router v6 wraps location state as { usr: userState, key }
  // so we must use that format when pushing to the browser history directly.
  await page.evaluate((e) => {
    const rrState = { usr: { email: e }, key: 'test' + Math.random().toString(36).slice(2) }
    window.history.pushState(rrState, '', '/verify-email')
    window.dispatchEvent(new PopStateEvent('popstate', { state: rrState }))
  }, email)
  await page.waitForURL('/verify-email')
}

test.describe('Verify Email Page', () => {
  // ── Access guard ──────────────────────────────────────────────────────────

  test('redirects to /login when accessed directly without email state', async ({ page }) => {
    await page.goto('/verify-email')
    await expect(page).toHaveURL('/login')
  })

  // ── Page structure ────────────────────────────────────────────────────────

  test('renders verify email page with OTP inputs and masked email', async ({ page }) => {
    await gotoVerifyEmail(page, 'jane@example.com')

    await expect(page.getByRole('heading', { name: /Verify your email/i })).toBeVisible()
    // The email should be masked e.g. "ja***@example.com"
    await expect(page.getByText(/ja\*+@example\.com/)).toBeVisible()

    // 6 individual OTP boxes
    const otpInputs = page.locator('input[maxlength="1"]')
    await expect(otpInputs).toHaveCount(6)

    await expect(page.getByRole('button', { name: /Verify email/i })).toBeVisible()
  })

  test('shows expiry countdown timer', async ({ page }) => {
    await gotoVerifyEmail(page)
    // Timer shows MM:SS format e.g. "4:59"
    await expect(page.getByText(/Expires in/i)).toBeVisible()
    await expect(page.getByText(/\d+:\d{2}/)).toBeVisible()
  })

  test('shows resend countdown on page load', async ({ page }) => {
    await gotoVerifyEmail(page)
    // Initially shows "Resend in Xs"
    await expect(page.getByText(/Resend in/i)).toBeVisible()
  })

  test('verify button is disabled when OTP is not complete', async ({ page }) => {
    await gotoVerifyEmail(page)
    await expect(page.getByRole('button', { name: /Verify email/i })).toBeDisabled()
  })

  test('back button navigates to login', async ({ page }) => {
    await gotoVerifyEmail(page)
    await page.getByRole('button', { name: /Back to sign in/i }).click()
    await expect(page).toHaveURL('/login')
  })

  // ── OTP input behavior ────────────────────────────────────────────────────

  test('enables verify button after all 6 digits are entered', async ({ page }) => {
    // Mock the verify endpoint to hang so auto-verify doesn't clear OTP state
    await page.route('**/api/v1/auth/verify-registration-otp', async (route) => {
      await new Promise(() => {}) // never resolves
    })
    await gotoVerifyEmail(page)

    const otpInputs = page.locator('input[maxlength="1"]')
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(String(i + 1))
    }

    await expect(page.getByRole('button', { name: /Verify email/i })).toBeEnabled()
  })

  test('auto-moves focus to next OTP box after each digit', async ({ page }) => {
    await gotoVerifyEmail(page)

    const otpInputs = page.locator('input[maxlength="1"]')
    await otpInputs.first().fill('1')
    // After typing, focus should have moved to the second input
    await expect(otpInputs.nth(1)).toBeFocused()
  })

  // ── Successful verification ───────────────────────────────────────────────

  test('verifies OTP and navigates to /chat on success', async ({ page }) => {
    await mockVerifyOtp(page)
    await mockChatApis(page)
    await gotoVerifyEmail(page)

    const otpInputs = page.locator('input[maxlength="1"]')
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(String(i + 1))
    }

    await expect(page).toHaveURL(/\/chat/)
  })

  test('auto-verifies when 6th digit is typed without clicking button', async ({ page }) => {
    await mockVerifyOtp(page)
    await mockChatApis(page)
    await gotoVerifyEmail(page)

    const otpInputs = page.locator('input[maxlength="1"]')
    // Fill all 6 — auto-verify fires on last digit
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(String(i + 1))
    }

    // Should navigate automatically without button click
    await expect(page).toHaveURL(/\/chat/, { timeout: 5000 })
  })

  // ── Failed verification ───────────────────────────────────────────────────

  test('shows error and clears OTP on invalid code', async ({ page }) => {
    await page.route('**/api/v1/auth/verify-registration-otp', (route) => {
      route.fulfill({ status: 400, json: { success: false, message: 'Invalid or expired code' } })
    })
    await gotoVerifyEmail(page)

    const otpInputs = page.locator('input[maxlength="1"]')
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill('9')
    }
    // Auto-verify fires on the 6th digit — no manual click needed

    await expect(page.locator('.error-text')).toContainText(/Invalid|expired/i)
    // OTP inputs should be cleared
    await expect(otpInputs.first()).toHaveValue('')
  })

  // ── Resend OTP ────────────────────────────────────────────────────────────

  test('shows Resend code button after cooldown expires', async ({ page }) => {
    // Override page clock to fast-forward the 60s cooldown
    await page.clock.install()
    await gotoVerifyEmail(page)

    // Fast-forward 61 seconds
    await page.clock.fastForward(61_000)

    await expect(page.getByRole('button', { name: /Resend code/i })).toBeVisible()
  })

  test('resends OTP and resets timers', async ({ page }) => {
    await mockResendOtp(page)
    await page.clock.install()
    await gotoVerifyEmail(page)

    await page.clock.fastForward(61_000)
    await expect(page.getByRole('button', { name: /Resend code/i })).toBeVisible()

    await page.getByRole('button', { name: /Resend code/i }).click()

    // After resend, the resend button should be hidden again (cooldown restarted)
    await expect(page.getByText(/Resend in/i)).toBeVisible()
  })

  test('shows error when resend fails', async ({ page }) => {
    await page.route('**/api/v1/auth/resend-otp', (route) => {
      route.fulfill({ status: 429, json: { success: false, message: 'Too many requests' } })
    })
    await page.clock.install()
    await gotoVerifyEmail(page)
    await page.clock.fastForward(61_000)

    await page.getByRole('button', { name: /Resend code/i }).click()
    await expect(page.locator('.error-text')).toBeVisible()
  })
})
